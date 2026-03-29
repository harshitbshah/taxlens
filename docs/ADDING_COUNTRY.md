# Adding a New Country

This guide walks through adding support for a new country — using Canada as the example.
You only need to touch files inside `src/countries/<code>/`. The rest of the app picks
up your country automatically via the plugin registries.

---

## Overview

Each country has two plugins:

| Plugin | File | Used by |
|---|---|---|
| `CountryServerPlugin` | `src/countries/<code>/index.ts` | Server routes, AI forecast/insights |
| `CountryClientPlugin` | `src/countries/<code>/views.tsx` | React components, nav, sidebar |

---

## Step 1 — Define your schema

Create a Zod schema for one year's return data. Place it in `src/lib/schema.ts`
alongside `TaxReturnSchema` and `IndianTaxReturnSchema`, or in a separate
`src/countries/<code>/schema.ts` if it's large.

```ts
// src/countries/canada/schema.ts
import { z } from "zod";

export const CanadianTaxReturnSchema = z.object({
  year: z.number(),          // calendar year (e.g. 2024)
  name: z.string(),
  province: z.string(),
  income: z.object({
    employment: z.number(),
    total: z.number(),
  }),
  tax: z.object({
    federal: z.number(),
    provincial: z.number(),
    total: z.number(),
    refundOrOwed: z.number(),
  }),
});

export type CanadianTaxReturn = z.infer<typeof CanadianTaxReturnSchema>;
```

---

## Step 2 — Write the PDF parser

Create `src/countries/canada/parser.ts`. Use the Claude API (Anthropic SDK) to
extract data from a base64-encoded PDF. Follow the pattern in
`src/lib/parser.ts` (US) or `src/lib/india-parser.ts` (India).

```ts
// src/countries/canada/parser.ts
import Anthropic from "@anthropic-ai/sdk";

import { CanadianTaxReturnSchema, type CanadianTaxReturn } from "./schema";

export async function parseCanadianReturn(
  pdfBase64: string,
  apiKey: string,
): Promise<CanadianTaxReturn> {
  const client = new Anthropic({ apiKey });
  // ... prompt Claude to extract data from the T1 return PDF ...
  // Parse and validate with CanadianTaxReturnSchema
}

export async function extractCanadianYearFromPdf(
  pdfBase64: string,
  apiKey: string,
): Promise<{ year: number } | null> {
  // Quick extraction of just the tax year — used for progress display before full parse
}
```

---

## Step 3 — Create the server plugin

```ts
// src/countries/canada/index.ts
import type { CountryServerPlugin } from "../../lib/country-registry";
import { parseCanadianReturn, extractCanadianYearFromPdf } from "./parser";
import { CanadianTaxReturnSchema, type CanadianTaxReturn } from "./schema";

export const canadaServerPlugin: CountryServerPlugin = {
  code: "canada",
  name: "Canada",
  flag: "🇨🇦",
  currency: "C$",

  storageFile: ".canada-tax-returns.json",
  schema: CanadianTaxReturnSchema,
  // Optional: add migrateReturn if you need to backfill fields in old stored data
  // migrateReturn: (raw) => ({ ...raw, missingField: (raw as any).missingField ?? [] }),

  getYear: (r) => (r as CanadianTaxReturn).year,
  yearLabel: (year) => String(year),
  summaryLabel: "All time",

  parseReturn: (pdfBase64, apiKey) => parseCanadianReturn(pdfBase64, apiKey),
  extractYearFromPdf: async (pdfBase64, apiKey) => {
    const result = await extractCanadianYearFromPdf(pdfBase64, apiKey);
    return result; // { year: number } | null
  },

  buildYearSummary: (r) => {
    const ret = r as CanadianTaxReturn;
    return {
      year: ret.year,
      province: ret.province,
      employmentIncome: ret.income.employment,
      totalIncome: ret.income.total,
      federalTax: ret.tax.federal,
      provincialTax: ret.tax.provincial,
      totalTax: ret.tax.total,
      refundOrOwed: ret.tax.refundOrOwed,
    };
  },

  // Optional: tax constants for the forecast prompt
  // constants: {
  //   get: (year) => getCanadaConstants(year),
  //   format: (c) => formatCanadaConstantsForPrompt(c as ...),
  // },

  // Optional: country-specific forecast extension
  // forecast: {
  //   schemaSnippet: (_year) => `"canada": { "rrspRoom": number, "tfsaRoom": number }`,
  //   parseExtension: (raw) => raw.canada ? { canada: raw.canada } : {},
  //   promptInstruction: "For Canada: include RRSP and TFSA contribution room.",
  // },
};
```

---

## Step 4 — Create the client plugin

```tsx
// src/countries/canada/views.tsx
import type { CountryClientPlugin } from "../../lib/country-registry";
import { CanadaReceiptView } from "../../components/CanadaReceiptView";
import { CanadaYearCharts } from "../../components/CanadaYearCharts";
import { CanadaSummaryView } from "../../components/CanadaSummaryView";
import { CanadaSummaryCharts } from "../../components/CanadaSummaryCharts";

export const canadaClientPlugin: CountryClientPlugin = {
  code: "canada",
  name: "Canada",
  flag: "🇨🇦",
  currency: "C$",

  getYear: (r) => (r as { year: number }).year,
  yearLabel: (year) => String(year),
  summaryLabel: "All time",

  components: {
    YearReceipt: CanadaReceiptView as React.ComponentType<{ data: unknown }>,
    YearCharts: CanadaYearCharts as React.ComponentType<{ data: unknown }>,
    SummaryView: CanadaSummaryView as React.ComponentType<{ returns: Record<number, unknown> }>,
    SummaryCharts: CanadaSummaryCharts as React.ComponentType<{ returns: Record<number, unknown> }>,
    // SummaryReceipt is optional
  },
};
```

---

## Step 5 — Register both plugins

**Server registry** (`src/countries/index.ts`):
```ts
import { canadaServerPlugin } from "./canada/index";

export const SERVER_REGISTRY: Record<string, CountryServerPlugin> = {
  [usServerPlugin.code]: usServerPlugin,
  [indiaServerPlugin.code]: indiaServerPlugin,
  [canadaServerPlugin.code]: canadaServerPlugin,   // ← add this line
};
```

**Client registry** (`src/countries/views.ts`):
```ts
import { canadaClientPlugin } from "./canada/views";

export const CLIENT_REGISTRY: Record<string, CountryClientPlugin> = {
  [usClientPlugin.code]: usClientPlugin,
  [indiaClientPlugin.code]: indiaClientPlugin,
  [canadaClientPlugin.code]: canadaClientPlugin,   // ← add this line
};
```

That's it. The app now:
- Fetches `GET /api/canada/returns` on startup
- Shows the 🇨🇦 Canada toggle in the sidebar when Canadian data is present
- Routes `POST /api/canada/parse` through `canadaServerPlugin.parseReturn`
- Includes Canadian tax history in the AI forecast prompt via `buildYearSummary`
- Renders the year and summary views from `canadaClientPlugin.components`

---

## What you still need to build

- **Receipt/charts components**: `CanadaReceiptView`, `CanadaYearCharts`, `CanadaSummaryView`, `CanadaSummaryCharts` — see `src/components/IndiaReceiptView.tsx` and `src/components/IndiaSummaryView.tsx` for reference implementations.
- **Tax constants** (optional but improves forecast accuracy): follow `src/lib/constants/india.ts` — define a `CanadaYearConstants` type, hard-code verified CRA bracket data, and wire it up through `plugin.constants`.
- **Upload UI** (optional): if Canada ITR upload needs its own trigger (like India's hidden file input), add a menu item in `Sidebar.tsx` and a handler in `App.tsx` following the India pattern.

---

## Checklist

- [ ] Zod schema + TypeScript type
- [ ] PDF parser (`parseReturn` + `extractYearFromPdf`)
- [ ] `CountryServerPlugin` in `src/countries/canada/index.ts`
- [ ] `CountryClientPlugin` in `src/countries/canada/views.tsx`
- [ ] Registered in both `src/countries/index.ts` and `src/countries/views.ts`
- [ ] At least one receipt view component
- [ ] Unit tests for parser + schema
- [ ] Manual smoke test: upload a real PDF, verify data loads and forecast runs
