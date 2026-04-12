import type React from "react";
import type { ZodSchema } from "zod";

/**
 * Server-side plugin: everything src/index.ts and AI lib files need for one country.
 * Must NOT import React or browser-only APIs.
 *
 * To add a country:
 *   1. Create src/countries/<code>/index.ts  exporting a CountryServerPlugin
 *   2. Register it in src/countries/index.ts
 */
export interface CountryServerPlugin {
  // ── Identity ────────────────────────────────────────────────────────────────
  code: string; // "us" | "india" | "canada" — lowercase ISO-like
  name: string; // "United States"
  flag: string; // "🇺🇸"
  currency: string; // "$" | "₹" | "C$"

  // ── Storage ─────────────────────────────────────────────────────────────────
  storageFile: string; // ".tax-returns.json"
  schema: ZodSchema; // Zod schema used to validate parsed returns at rest
  // Optional pre-validation migration (e.g. backfilling missing array fields in old US data).
  migrateReturn?: (raw: unknown) => unknown;

  // ── Year handling ────────────────────────────────────────────────────────────
  // Extract the canonical storage key from a return object.
  // US: r.year (calendar year). India: r.financialYear (FY start year, e.g. 2024 for FY 2024-25).
  getYear: (r: unknown) => number;
  // Human-readable label for a year in nav + prompts.
  yearLabel: (year: number) => string; // "2024" or "FY 2024-25"
  summaryLabel: string; // "All time" | "All years"

  // ── Parsing ──────────────────────────────────────────────────────────────────
  // Parse a base64-encoded PDF and return a validated return object.
  parseReturn: (pdfBase64: string, apiKey: string) => Promise<unknown>;
  // Quickly extract year info from a PDF before the full parse.
  // Return value is passed through as JSON to the client; shape is country-specific.
  // US: { year: number } | null.  India: { assessmentYear, financialYear } | null.
  extractYearFromPdf: (pdfBase64: string, apiKey: string) => Promise<unknown>;

  // ── AI helpers ───────────────────────────────────────────────────────────────
  // Compact per-year representation sent to Claude in forecast + insights prompts.
  buildYearSummary: (r: unknown) => object;

  // Verified tax constants for this country (optional — not every country has them yet).
  constants?: {
    get: (year: number) => unknown; // null when year is not yet on file
    format: (c: unknown) => string; // formats the constants block for a Claude prompt
  };

  // Country-specific forecast extension (optional).
  // Defines the extra JSON fields Claude should return for this country,
  // and how to parse them back from the raw response.
  forecast?: {
    // JSON schema snippet injected into the Claude prompt for the projected year.
    // Example: '"bracket": { "rate": number, "floor": number, ... }'
    schemaSnippet: (projectedYear: number) => string;
    // Extract and normalise the country-specific section from Claude's raw JSON.
    parseExtension: (raw: Record<string, unknown>) => unknown;
    // Single instruction line appended to the prompt (e.g. "For India: compare regimes…")
    promptInstruction?: string;
  };
}

/**
 * Client-side plugin: everything App.tsx and React components need for one country.
 * Must NOT import Bun, Anthropic SDK, or anything that would be bundled server-side only.
 *
 * To add a country:
 *   1. Create src/countries/<code>/views.tsx  exporting a CountryClientPlugin
 *   2. Register it in src/countries/views.ts
 */
export interface CountryClientPlugin {
  // ── Identity (must match the server plugin) ──────────────────────────────────
  code: string;
  name: string;
  flag: string;
  currency: string;

  // ── Year handling (same logic as server plugin, duplicated to avoid server imports) ──
  getYear: (r: unknown) => number;
  yearLabel: (year: number) => string;
  summaryLabel: string;

  // ── View components ──────────────────────────────────────────────────────────
  // All typed as `unknown` in the interface so the registry is generic.
  // Each concrete plugin casts its typed components when registering.
  components: {
    // Stats bar shown at the top of summary and individual-year views (optional).
    StatsHeader?: React.ComponentType<{
      returns: Record<number, unknown>;
      selectedYear: "summary" | number;
    }>;
    // Single-year receipt / breakdown view.
    YearReceipt: React.ComponentType<{ data: unknown }>;
    // Single-year charts tab.
    YearCharts: React.ComponentType<{ data: unknown }>;
    // Multi-year summary table (default summary tab).
    SummaryView: React.ComponentType<{ returns: Record<number, unknown> }>;
    // Multi-year summary charts tab.
    SummaryCharts: React.ComponentType<{ returns: Record<number, unknown> }>;
    // Multi-year summary receipt-style tab (optional).
    SummaryReceipt?: React.ComponentType<{ returns: Record<number, unknown> }>;
  };

  // Country-specific forecast card rendered below the main forecast metrics (optional).
  forecast?: {
    ExtensionCard: React.ComponentType<{ data: unknown }>;
  };
}
