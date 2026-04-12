import Anthropic from "@anthropic-ai/sdk";
import { argv, serve } from "bun";
import path from "path";
import { fileURLToPath } from "url";

import { SERVER_REGISTRY } from "./countries/index";
import index from "./index.html";
import { clearAnalysisCache, getAnalysisCache, saveAnalysisCache } from "./lib/analysis-cache";
import { parseAnalysisResponse } from "./lib/analysis-schema";
import {
  clearCountryData,
  deleteCountryReturn,
  getCountryReturns,
  saveCountryReturn,
} from "./lib/country-storage";
import { clearForecastCache, getForecastCache, saveForecastCache } from "./lib/forecast-cache";
import { getForecastProfile, saveForecastProfile } from "./lib/forecast-profile";
import { generateForecast } from "./lib/forecaster";
import { generateInsights } from "./lib/insights";
import { clearInsightsCache, getInsightsCache, saveInsightsCache } from "./lib/insights-cache";
import { extractYearFromPdf, parseTaxReturn } from "./lib/parser";
import {
  deleteRetirementAccounts,
  getAllRetirementAccounts,
  saveRetirementAccounts,
} from "./lib/retirement-accounts";
import {
  clearAllData,
  deleteReturn,
  getApiKey,
  getReturns,
  removeApiKey,
  saveApiKey,
  saveReturn,
} from "./lib/storage";

// Model used for lightweight operations (validation, suggestions)
const FAST_MODEL = "claude-haiku-4-5-20251001";

function isAuthError(message: string): boolean {
  return (
    message.includes("authentication") || message.includes("401") || message.includes("API key")
  );
}

// Parse --port from command line args (supports --port=XXXX or --port XXXX)
function parsePort(): number {
  const idx = argv.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
  if (idx === -1) return 3000;
  const arg = argv[idx]!;
  if (arg.startsWith("--port=")) return Number(arg.split("=")[1]);
  return Number(argv[idx + 1]) || 3000;
}
const port = parsePort();
const isProd = process.env.NODE_ENV === "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_ROOT = process.env.TAX_UI_STATIC_DIR || __dirname;

function buildChatSystemPrompt(
  returns: Record<number, unknown>,
  selectedYear?: number | string,
): string {
  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => a - b);
  const yearRange =
    years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0]?.toString() || "none";

  const activeYear =
    selectedYear && selectedYear !== "summary" ? Number(selectedYear) : years[years.length - 1];
  const activeContext =
    activeYear && returns[activeYear]
      ? `\nCURRENTLY VIEWED YEAR: ${activeYear}\n${JSON.stringify(returns[activeYear])}`
      : `\n${JSON.stringify(returns)}`;

  return `You are a helpful tax data analysis assistant. You have access to the user's tax return data.

IMPORTANT FORMATTING RULES:
- Format all currency values with $ and commas (e.g., $1,234,567)
- Format percentages to 1 decimal place (e.g., 22.5%)
- Be concise and direct in your responses
- When comparing years, show values side by side
- When the user says "my year" or "this year", default to the CURRENTLY VIEWED YEAR unless they specify otherwise

TAX DATA AVAILABLE:
All years on file: ${yearRange}
${activeContext}

Answer questions about the user's income, taxes, deductions, credits, and tax rates based on this data.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const routes: Record<string, any> = {
  "/api/config": {
    GET: () => {
      const hasKey = Boolean(getApiKey());
      const isDemo = process.env.DEMO_MODE === "true";
      const isDev = process.env.NODE_ENV !== "production";
      return Response.json({ hasKey, isDemo, isDev });
    },
  },
  "/api/config/key": {
    POST: async (req: Request) => {
      const { apiKey } = await req.json();
      if (!apiKey || typeof apiKey !== "string") {
        return Response.json({ error: "Invalid API key" }, { status: 400 });
      }

      // Validate the key with a minimal API call
      try {
        const client = new Anthropic({ apiKey: apiKey.trim() });
        await client.messages.create({
          model: FAST_MODEL,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (isAuthError(message)) {
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        // Other errors (rate limit, etc.) - key is probably valid
      }

      await saveApiKey(apiKey.trim());
      return Response.json({ success: true });
    },
  },
  "/api/clear-data": {
    POST: async () => {
      await clearAllData();
      // Clear all registered country data (US is handled by clearAllData above)
      await Promise.all(
        Object.values(SERVER_REGISTRY)
          .filter((p) => p.code !== "us")
          .map((p) => clearCountryData(p)),
      );
      await clearForecastCache(); // no arg = clears all countries
      await clearInsightsCache();
      return Response.json({ success: true });
    },
  },
  "/api/returns": {
    GET: async () => {
      return Response.json(await getReturns());
    },
    // Claude Code import path: accepts a pre-parsed TaxReturn JSON, validates, and saves.
    POST: async (req: Request) => {
      const body = await req.json();
      const plugin = SERVER_REGISTRY["us"];
      if (!plugin) return Response.json({ error: "US plugin not registered" }, { status: 500 });
      const migrated = plugin.migrateReturn ? plugin.migrateReturn(body) : body;
      const result = plugin.schema.safeParse(migrated);
      if (!result.success) {
        return Response.json(
          { error: "Invalid TaxReturn schema", issues: result.error.issues },
          { status: 400 },
        );
      }
      await saveReturn(result.data as import("./lib/schema").TaxReturn);
      return Response.json({
        success: true,
        year: (result.data as import("./lib/schema").TaxReturn).year,
      });
    },
  },
  "/api/returns/:year": {
    DELETE: async (req: Request & { params: { year: string } }) => {
      const year = Number(req.params.year);
      if (isNaN(year)) {
        return Response.json({ error: "Invalid year" }, { status: 400 });
      }
      await deleteReturn(year);
      return Response.json({ success: true });
    },
  },
  "/api/extract-year": {
    POST: async (req: Request) => {
      const formData = await req.formData();
      const file = formData.get("pdf") as File | null;

      if (!file) {
        return Response.json({ error: "No PDF file provided" }, { status: 400 });
      }

      const formApiKey = formData.get("apiKey") as string | null;
      const apiKey = formApiKey || getApiKey();
      if (!apiKey) {
        return Response.json({ error: "No API key configured" }, { status: 400 });
      }

      try {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const year = await extractYearFromPdf(base64, apiKey);
        return Response.json({ year });
      } catch (error) {
        console.error("Year extraction error:", error);
        const message = error instanceof Error ? error.message : "";
        if (isAuthError(message)) {
          await removeApiKey();
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        return Response.json({ year: null });
      }
    },
  },
  "/api/chat": {
    POST: async (req: Request) => {
      const { prompt, history, returns: clientReturns, selectedYear } = await req.json();

      if (!prompt || typeof prompt !== "string") {
        return Response.json({ error: "No prompt provided" }, { status: 400 });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ error: "No API key configured" }, { status: 400 });
      }

      // Use client-provided returns (for dev sample data) or fall back to stored returns
      const returns =
        clientReturns && Object.keys(clientReturns).length > 0 ? clientReturns : await getReturns();
      const client = new Anthropic({ apiKey });

      try {
        // Build messages from history
        const messages: Anthropic.MessageParam[] = [];
        for (const msg of history || []) {
          messages.push({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          });
        }
        messages.push({ role: "user", content: prompt });

        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: buildChatSystemPrompt(returns, selectedYear),
          messages,
        });

        const textBlock = response.content.find((block) => block.type === "text");
        const responseText = textBlock?.type === "text" ? textBlock.text : "No response";

        return Response.json({ response: responseText });
      } catch (error) {
        console.error("Chat error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        if (isAuthError(message)) {
          await removeApiKey();
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        return Response.json({ error: message }, { status: 500 });
      }
    },
  },
  "/api/suggestions": {
    POST: async (req: Request) => {
      const { history, returns: clientReturns } = await req.json();

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ suggestions: [] });
      }

      const _returns =
        clientReturns && Object.keys(clientReturns).length > 0 ? clientReturns : await getReturns();

      const client = new Anthropic({ apiKey });

      try {
        const messages: Anthropic.MessageParam[] = history.map(
          (msg: { role: string; content: string }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
          }),
        );
        // Structured outputs don't allow assistant messages in final position
        messages.push({ role: "user", content: "Suggest 3 follow-up questions I might ask." });

        const response = await client.messages.create({
          model: FAST_MODEL,
          max_tokens: 256,
          system: `You are helping a user explore their own tax return data. Generate 3 short follow-up questions the user might want to ask about their finances. Phrase questions in FIRST PERSON (e.g., "Why did my income drop?" not "Why did your income drop?").`,
          messages,
          output_config: {
            format: {
              type: "json_schema",
              schema: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        });

        const textBlock = response.content.find((block) => block.type === "text");
        const suggestions = JSON.parse(textBlock?.type === "text" ? textBlock.text : "[]");

        return Response.json({ suggestions: suggestions.slice(0, 3) });
      } catch (error) {
        console.error("Suggestions error:", error);
        return Response.json({ suggestions: [] });
      }
    },
  },
  // ── Generic country routes ────────────────────────────────────────────────
  // Handles any registered country: /api/india/*, /api/canada/*, etc.
  // US returns are served via the legacy /api/returns routes above for backward compat.
  "/api/:country/returns": {
    GET: async (req: Request & { params: { country: string } }) => {
      const plugin = SERVER_REGISTRY[req.params.country];
      if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 });
      return Response.json(await getCountryReturns(plugin));
    },
    // Claude Code import path: accepts a pre-parsed country return JSON, validates, and saves.
    POST: async (req: Request & { params: { country: string } }) => {
      const plugin = SERVER_REGISTRY[req.params.country];
      if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 });
      const body = await req.json();
      const migrated = plugin.migrateReturn ? plugin.migrateReturn(body) : body;
      const result = plugin.schema.safeParse(migrated);
      if (!result.success) {
        return Response.json(
          { error: `Invalid ${plugin.code} return schema`, issues: result.error.issues },
          { status: 400 },
        );
      }
      await saveCountryReturn(plugin, result.data);
      return Response.json({ success: true });
    },
  },
  "/api/:country/returns/:year": {
    DELETE: async (req: Request & { params: { country: string; year: string } }) => {
      const plugin = SERVER_REGISTRY[req.params.country];
      if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 });
      const year = Number(req.params.year);
      if (isNaN(year)) return Response.json({ error: "Invalid year" }, { status: 400 });
      await deleteCountryReturn(plugin, year);
      return Response.json({ success: true });
    },
  },
  "/api/:country/extract-year": {
    POST: async (req: Request & { params: { country: string } }) => {
      const plugin = SERVER_REGISTRY[req.params.country];
      if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 });

      const formData = await req.formData();
      const file = formData.get("pdf") as File | null;
      if (!file) return Response.json({ error: "No PDF file provided" }, { status: 400 });

      const apiKey = getApiKey();
      if (!apiKey) return Response.json({ error: "No API key configured" }, { status: 400 });

      try {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        const result = await plugin.extractYearFromPdf(base64, apiKey);
        return Response.json(result ?? null);
      } catch (error) {
        console.error(`${plugin.code} year extraction error:`, error);
        return Response.json(null);
      }
    },
  },
  "/api/:country/parse": {
    POST: async (req: Request & { params: { country: string } }) => {
      const plugin = SERVER_REGISTRY[req.params.country];
      if (!plugin) return Response.json({ error: "Unknown country" }, { status: 404 });

      const formData = await req.formData();
      const file = formData.get("pdf") as File | null;
      if (!file) return Response.json({ error: "No PDF file provided" }, { status: 400 });

      const apiKey = getApiKey();
      if (!apiKey) return Response.json({ error: "No API key configured" }, { status: 400 });

      try {
        const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
        const result = await plugin.parseReturn(base64, apiKey);
        await saveCountryReturn(plugin, result);
        return Response.json(result);
      } catch (error) {
        console.error(`${plugin.code} parse error:`, error);
        const message = error instanceof Error ? error.message : "Unknown error";
        if (isAuthError(message)) {
          await removeApiKey();
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        return Response.json({ error: message }, { status: 500 });
      }
    },
  },
  // Literal path (not parameterized) so Bun's /* SPA wildcard doesn't intercept GET requests.
  // Year is passed as a query param: GET/POST /api/insights?year=2024
  "/api/insights": async (req: Request) => {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year"));
    if (isNaN(year) || year === 0) return Response.json({ error: "Invalid year" }, { status: 400 });

    if (req.method === "GET") {
      const cached = await getInsightsCache(year);
      if (!cached) return new Response("Not found", { status: 404 });
      return Response.json(cached);
    }

    if (req.method === "POST") {
      const apiKey = getApiKey();
      if (!apiKey) return Response.json({ error: "No API key configured" }, { status: 400 });

      try {
        const indiaPlugin = SERVER_REGISTRY["india"];
        const [usReturns, indiaReturns] = await Promise.all([
          getReturns(),
          indiaPlugin ? getCountryReturns(indiaPlugin) : Promise.resolve({}),
        ]);
        if (!usReturns[year]) {
          return Response.json({ error: `No return on file for year ${year}` }, { status: 404 });
        }
        const items = await generateInsights(
          year,
          usReturns,
          indiaReturns as Record<number, import("./lib/schema").IndianTaxReturn>,
          apiKey,
        );
        await saveInsightsCache(year, items);
        return Response.json(items);
      } catch (error) {
        console.error("Insights error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
  // Literal path — year and country passed as query params.
  // POST accepts pre-generated JSON from Claude Code (no server-side AI calls).
  "/api/analysis": async (req: Request) => {
    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year"));
    const country = url.searchParams.get("country") || "us";
    if (isNaN(year) || year === 0) return Response.json({ error: "Invalid year" }, { status: 400 });

    if (req.method === "GET") {
      const cached = await getAnalysisCache(year, country);
      if (!cached) return new Response("Not found", { status: 404 });
      return Response.json(cached);
    }

    if (req.method === "POST") {
      let analysis;
      try {
        analysis = parseAnalysisResponse(await req.json());
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid JSON";
        return Response.json({ error: message }, { status: 400 });
      }
      await saveAnalysisCache(year, country, analysis);
      return Response.json(analysis);
    }

    if (req.method === "DELETE") {
      await clearAnalysisCache(year, country);
      return Response.json({ success: true });
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
  // Country is passed as a query param: GET/POST /api/forecast-profile?country=us
  "/api/forecast-profile": async (req: Request) => {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || "us";
    if (req.method === "GET") {
      const profile = await getForecastProfile(country);
      return Response.json(profile ?? {});
    }
    if (req.method === "POST") {
      const body = (await req.json()) as Record<string, unknown>;
      await saveForecastProfile(country, body);
      return Response.json({ success: true });
    }
    return new Response("Method Not Allowed", { status: 405 });
  },
  // GET /api/retirement-accounts — all years; POST ?year=N — save year; DELETE ?year=N — delete year
  "/api/retirement-accounts": async (req: Request) => {
    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    if (req.method === "GET") {
      const all = await getAllRetirementAccounts();
      return Response.json(all);
    }
    if (req.method === "POST") {
      if (!yearParam) return Response.json({ error: "Missing year" }, { status: 400 });
      const body = (await req.json()) as unknown[];
      await saveRetirementAccounts(Number(yearParam), body as never);
      return Response.json({ success: true });
    }
    if (req.method === "DELETE") {
      if (!yearParam) return Response.json({ error: "Missing year" }, { status: 400 });
      await deleteRetirementAccounts(Number(yearParam));
      return Response.json({ success: true });
    }
    return new Response("Method Not Allowed", { status: 405 });
  },
  // Bun's wildcard "/*" conflicts with multi-method route objects, so branch on req.method.
  // Country is passed as a query param: GET/POST /api/forecast?country=us (defaults to "us")
  "/api/forecast": async (req: Request) => {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || "us";
    const plugin = SERVER_REGISTRY[country];
    if (!plugin) return Response.json({ error: "Unknown country" }, { status: 400 });

    if (req.method === "GET") {
      const cached = await getForecastCache(country);
      if (!cached) return new Response("Not found", { status: 404 });
      return Response.json(cached);
    }

    if (req.method === "POST") {
      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ error: "No API key configured" }, { status: 400 });
      }

      try {
        const returns = country === "us" ? await getReturns() : await getCountryReturns(plugin);
        if (Object.keys(returns).length === 0) {
          return Response.json({ error: "No tax returns on file" }, { status: 400 });
        }

        const profile = await getForecastProfile(country);
        const forecast = await generateForecast(
          { [country]: returns },
          [plugin],
          apiKey,
          profile ?? undefined,
        );
        await saveForecastCache(country, forecast);
        return Response.json(forecast);
      } catch (error) {
        console.error("Forecast error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return Response.json({ error: message }, { status: 500 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
  "/api/parse": {
    POST: async (req: Request) => {
      const formData = await req.formData();
      const file = formData.get("pdf") as File | null;
      const apiKeyFromForm = formData.get("apiKey") as string | null;

      if (!file) {
        return Response.json({ error: "No PDF file provided" }, { status: 400 });
      }

      const apiKey = apiKeyFromForm?.trim() || getApiKey();
      if (!apiKey) {
        return Response.json({ error: "No API key provided" }, { status: 400 });
      }

      try {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const taxReturn = await parseTaxReturn(base64, apiKey);

        // Save key only after successful parse
        if (apiKeyFromForm?.trim()) {
          await saveApiKey(apiKeyFromForm.trim());
        }

        await saveReturn(taxReturn);
        return Response.json(taxReturn);
      } catch (error) {
        console.error("Parse error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";

        if (isAuthError(message)) {
          await removeApiKey();
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        if (message.includes("prompt is too long") || message.includes("too many tokens")) {
          return Response.json(
            { error: "PDF is too large to process. Try uploading just the main tax forms." },
            { status: 400 },
          );
        }
        if (message.includes("JSON")) {
          return Response.json({ error: "Failed to parse tax return data" }, { status: 422 });
        }
        return Response.json({ error: message }, { status: 500 });
      }
    },
  },
};

if (!isProd) {
  routes["/*"] = index;
}

const server = serve({
  port,
  // Claude API calls (forecast, parse) can take 30–90s. Default idle timeout is 10s.
  idleTimeout: 120,
  routes,
  fetch: isProd
    ? async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const resolvedPath = path.resolve(STATIC_ROOT, `.${pathname}`);

        if (!resolvedPath.startsWith(STATIC_ROOT)) {
          return new Response("Not found", { status: 404 });
        }

        const file = Bun.file(resolvedPath);
        if (await file.exists()) {
          return new Response(file);
        }

        return new Response("Not found", { status: 404 });
      }
    : undefined,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
