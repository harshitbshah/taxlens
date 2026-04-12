import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { AnalysisResponse, AnalysisSection, AnalysisSectionId } from "../lib/analysis-schema";
import { parseAnalysisResponse } from "../lib/analysis-schema";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface Props {
  year: number;
  country: string;
  returnData: unknown;
}

type State =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "loaded"; data: AnalysisResponse }
  | { status: "error"; message: string };

const SECTION_ORDER: AnalysisSectionId[] = [
  "outcome",
  "root_cause",
  "income_story",
  "capital_gains",
  "key_decisions",
  "watch_next_year",
];

function buildPromptTemplate(year: number, country: string, returnData: unknown): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3005";
  const returnJson = JSON.stringify(returnData, null, 2);

  return `Analyze the ${year} ${country.toUpperCase()} tax return and produce a structured analysis JSON.

## Return Data
${returnJson}

## Required Output
Return exactly this JSON structure. Write rich markdown in each "markdown" field — use tables, bullet lists, and headers where appropriate. Be specific with dollar amounts and rates from the return data above.

{
  "year": ${year},
  "country": "${country}",
  "source": "claude_code",
  "generatedAt": "<current ISO timestamp>",
  "sections": [
    {
      "id": "outcome",
      "title": "Tax Outcome",
      "markdown": "<summary table: amount owed/refunded, total tax, effective rate, marginal rate>",
      "generatedAt": "<current ISO timestamp>"
    },
    {
      "id": "root_cause",
      "title": "Why You Owed / Got a Refund",
      "markdown": "<total withheld vs total tax owed, delta, root cause breakdown by source with dollar amounts>",
      "generatedAt": "<current ISO timestamp>"
    },
    {
      "id": "income_story",
      "title": "Income Story",
      "markdown": "<how each income type was classified and taxed — ordinary rates vs preferential QDCG rates>",
      "generatedAt": "<current ISO timestamp>"
    },
    {
      "id": "capital_gains",
      "title": "Capital Gains",
      "markdown": "<short-term vs long-term breakdown, by source where known, tax rates applied>",
      "generatedAt": "<current ISO timestamp>"
    },
    {
      "id": "key_decisions",
      "title": "Key Decisions",
      "markdown": "<itemized vs standard deduction choice, credits claimed, other elections that shaped the outcome>",
      "generatedAt": "<current ISO timestamp>"
    },
    {
      "id": "watch_next_year",
      "title": "Watch for ${year + 1}",
      "markdown": "<forward-looking actions with estimated dollar impacts, safe harbor withholding target>",
      "generatedAt": "<current ISO timestamp>"
    }
  ]
}

POST the result to: ${origin}/api/analysis?year=${year}&country=${country}
Or paste it into TaxLens — Analysis tab → Paste JSON.`;
}

// Markdown renderer with Tailwind-compatible styling
function AnalysisMarkdown({ content }: { content: string }) {
  return (
    <div className="analysis-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-5 mb-2 text-sm font-semibold text-(--color-text) first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-sm font-semibold text-(--color-text) first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-sm font-medium text-(--color-text)">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 text-sm leading-relaxed text-(--color-text) last:mb-0">{children}</p>
          ),
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm text-(--color-text)">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-(--color-text)">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto rounded-lg border border-(--color-border)">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-(--color-bg-muted)">{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b border-(--color-border) last:border-0">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-xs font-medium tracking-wide text-(--color-text-muted) uppercase">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-sm text-(--color-text)">{children}</td>
          ),
          code: ({ children, className }) => {
            const isBlock = Boolean(className?.includes("language-"));
            return isBlock ? (
              <code className="font-mono text-xs">{children}</code>
            ) : (
              <code className="rounded bg-(--color-bg-muted) px-1 py-0.5 font-mono text-xs text-(--color-text)">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-2 overflow-x-auto rounded-md bg-(--color-bg-muted) p-3 text-xs">
              {children}
            </pre>
          ),
          hr: () => <hr className="my-4 border-(--color-border)" />,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-(--color-border) pl-3 text-sm text-(--color-text-muted) italic">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400"
            >
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function SectionCard({ section }: { section: AnalysisSection }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg)">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-(--color-text)">{section.title}</span>
        <span className="ml-4 shrink-0 text-xs text-(--color-text-tertiary)">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="border-t border-(--color-border) px-5 py-4">
          <AnalysisMarkdown content={section.markdown} />
        </div>
      )}
    </div>
  );
}

function PasteJsonDialog({
  open,
  year,
  country,
  onClose,
  onSaved,
}: {
  open: boolean;
  year: number;
  country: string;
  onClose: () => void;
  onSaved: (data: AnalysisResponse) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setValue("");
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    setError(null);
    let parsed: AnalysisResponse;
    try {
      parsed = parseAnalysisResponse(JSON.parse(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/analysis?year=${year}&country=${country}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Server error ${res.status}`);
      }
      onSaved(parsed);
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Import Analysis JSON"
      description="Paste the JSON output from Claude Code. It must match the AnalysisResponse schema."
      size="lg"
      footer={
        <div className="flex justify-end gap-2 border-t border-(--color-border) px-6 py-4">
          <Button variant="secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !value.trim()}>
            {saving ? "Saving…" : "Import"}
          </Button>
        </div>
      }
    >
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='{"year": 2025, "country": "us", "source": "claude_code", ...}'
        className="h-64 w-full resize-none rounded-lg border border-(--color-border) bg-(--color-bg-subtle) p-3 font-mono text-xs text-(--color-text) outline-none focus:border-(--color-text-muted)"
        spellCheck={false}
      />
      {error && <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </Dialog>
  );
}

export function AnalysisPanel({ year, country, returnData }: Props) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setState({ status: "loading" });
    fetch(`/api/analysis?year=${year}&country=${country}`)
      .then(async (res) => {
        if (res.status === 404) {
          setState({ status: "empty" });
        } else if (res.ok) {
          const data = (await res.json()) as AnalysisResponse;
          setState({ status: "loaded", data });
        } else {
          setState({ status: "error", message: `Failed to load analysis (HTTP ${res.status})` });
        }
      })
      .catch((err) => {
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Could not reach server",
        });
      });
  }, [year, country]);

  async function handleRegenerate() {
    await fetch(`/api/analysis?year=${year}&country=${country}`, { method: "DELETE" });
    setState({ status: "empty" });
  }

  async function handleCopyPrompt() {
    const template = buildPromptTemplate(year, country, returnData);
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 md:px-0">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-(--color-bg-muted)" />
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-0">
        <div className="flex items-center justify-between rounded-xl border border-(--color-border) bg-(--color-bg) p-4">
          <p className="text-xs text-rose-600 dark:text-rose-400">{state.message}</p>
          <button
            onClick={() => setState({ status: "loading" })}
            className="ml-3 shrink-0 cursor-pointer rounded-md border border-(--color-border) px-3 py-1.5 text-xs transition-colors hover:bg-(--color-bg-muted)"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <>
        <div className="mx-auto max-w-3xl px-4 py-6 md:px-0">
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg) p-6">
            <p className="text-sm font-medium text-(--color-text)">Analysis — {year}</p>
            <p className="mt-1 text-sm text-(--color-text-muted)">
              Generate this analysis in Claude Code, then import it here for a persistent,
              structured view.
            </p>

            <ol className="mt-4 space-y-2 text-sm text-(--color-text-muted)">
              <li>
                <span className="font-medium text-(--color-text)">1.</span> Copy the prompt below
                into Claude Code
              </li>
              <li>
                <span className="font-medium text-(--color-text)">2.</span> Claude Code outputs JSON
                in the required schema
              </li>
              <li>
                <span className="font-medium text-(--color-text)">3.</span> Paste the JSON back
                here, or have Claude Code POST it directly
              </li>
            </ol>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={handleCopyPrompt} variant="primary">
                {copied ? "Copied!" : "Copy prompt for Claude Code"}
              </Button>
              <Button variant="outline" onClick={() => setPasteOpen(true)}>
                Paste JSON
              </Button>
            </div>

            <div className="mt-4 rounded-lg bg-(--color-bg-subtle) px-4 py-3">
              <p className="mb-1 text-xs font-medium text-(--color-text-muted)">
                Or have Claude Code POST directly:
              </p>
              <code className="text-xs text-(--color-text-muted)">
                POST {typeof window !== "undefined" ? window.location.origin : ""}
                /api/analysis?year=
                {year}&country={country}
              </code>
            </div>
          </div>
        </div>

        <PasteJsonDialog
          open={pasteOpen}
          year={year}
          country={country}
          onClose={() => setPasteOpen(false)}
          onSaved={(data) => setState({ status: "loaded", data })}
        />
      </>
    );
  }

  // Loaded — render sections in canonical order, fall back to response order for any extras
  const sectionMap = new Map(state.data.sections.map((s) => [s.id, s]));
  const orderedSections = [
    ...SECTION_ORDER.map((id) => sectionMap.get(id)).filter(Boolean),
    ...state.data.sections.filter((s) => !SECTION_ORDER.includes(s.id)),
  ] as AnalysisSection[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-0">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-widest text-(--color-text-muted) uppercase">
          Analysis — {year}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-(--color-text-tertiary)">
            via {state.data.source === "claude_code" ? "Claude Code" : "API"}
          </span>
          <button
            onClick={handleRegenerate}
            className="cursor-pointer rounded-md border border-(--color-border) px-2.5 py-1 text-xs text-(--color-text-muted) transition-colors hover:bg-(--color-bg-muted) hover:text-(--color-text)"
          >
            ⟳ Regenerate
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {orderedSections.map((section) => (
          <SectionCard key={section.id} section={section} />
        ))}
      </div>
    </div>
  );
}
