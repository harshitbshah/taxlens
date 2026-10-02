/**
 * Patches the tax computation for an India ITR by extracting only the
 * last N pages (where Part B-TTI / tax computation lives in ITR-2).
 */

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";

import { saveIndiaReturn } from "../src/lib/india-storage";
import { getIndiaReturns } from "../src/lib/india-storage";

const apiKey = process.env.ANTHROPIC_API_KEY!;
const client = new Anthropic({ apiKey });

const pdfPath = process.argv[2]!;
const financialYear = Number(process.argv[3]);

if (!pdfPath || isNaN(financialYear)) {
  console.error("Usage: bun run scripts/fix-india-tax.ts <pdf> <financialYear>");
  process.exit(1);
}

const pdfBytes = await Bun.file(pdfPath).arrayBuffer();
const pdfDoc = await PDFDocument.load(pdfBytes);
const total = pdfDoc.getPageCount();
console.log(`Total pages: ${total}`);

// Extract last 40 pages (Part B-TTI, Schedule TDS, tax summary are all here)
const startPage = Math.max(0, total - 40);
const newDoc = await PDFDocument.create();
const pages = await newDoc.copyPages(
  pdfDoc,
  Array.from({ length: total - startPage }, (_, i) => startPage + i),
);
pages.forEach((p) => newDoc.addPage(p));
const chunkBase64 = Buffer.from(await newDoc.save()).toString("base64");

console.log(`Extracted pages ${startPage + 1}–${total}, sending to Claude...`);

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: chunkBase64 },
        },
        {
          type: "text",
          text: `From this ITR-2 (Part B-TTI and Schedule TDS pages), extract the tax computation as JSON:
{
  "grossTax": <number>,
  "surcharge": <number>,
  "educationCess": <number>,
  "totalTaxLiability": <number>,
  "tds": [{"label": <string>, "amount": <number>}],
  "advanceTax": [{"label": <string>, "amount": <number>}],
  "selfAssessmentTax": [{"label": <string>, "amount": <number>}],
  "totalTaxPaid": <number>,
  "refundOrDue": <number>
}
All amounts in INR as plain numbers. refundOrDue: positive = refund, negative = due.
Return ONLY the JSON object.`,
        },
      ],
    },
  ],
});

const text = response.content.find((b) => b.type === "text")?.text ?? "";
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("No JSON found in response:\n", text);
  process.exit(1);
}

const taxData = JSON.parse(jsonMatch[0]);
console.log("Extracted tax data:", JSON.stringify(taxData, null, 2));

// Patch the stored return
const returns = await getIndiaReturns();
const existing = returns[financialYear];
if (!existing) {
  console.error(`No stored return for FY ${financialYear}`);
  process.exit(1);
}

existing.tax = { ...existing.tax, ...taxData };
existing.summary.totalTaxPaid = existing.tax.totalTaxPaid;
existing.summary.refundOrDue = existing.tax.refundOrDue;

await saveIndiaReturn(existing);
console.log(`\n✓ Patched FY ${financialYear} tax data`);
