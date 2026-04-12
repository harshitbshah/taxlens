import "./index.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Chat, type ChatMessage } from "./components/Chat";
import { DemoDialog } from "./components/DemoDialog";
import { DevTools } from "./components/DevTools";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { MainPanel } from "./components/MainPanel";
import { ResetDialog } from "./components/ResetDialog";
import { SettingsModal } from "./components/SettingsModal";
import { SetupDialog } from "./components/SetupDialog";
import { Sidebar } from "./components/Sidebar";
import { UploadModal } from "./components/UploadModal";
import { CLIENT_REGISTRY } from "./countries/views";
import { sampleReturns } from "./data/sampleData";
import { getDevDemoOverride, isHostedEnvironment, resolveDemoMode } from "./lib/env";
import type { ForecastProfile } from "./lib/forecast-profile-schema";
import type { ForecastResponse } from "./lib/forecaster";
import {
  buildNavItems,
  getDefaultSelection,
  getDefaultUsSelection,
  parseSelectedId,
  type SelectedView,
} from "./lib/nav";
import type {
  AllRetirementAccounts,
  RetirementAccountsYear,
} from "./lib/retirement-accounts-schema";
import type {
  FileProgress,
  FileWithId,
  IndianTaxReturn,
  PendingUpload,
  TaxReturn,
} from "./lib/schema";
import { extractYearFromFilename } from "./lib/year-extractor";

export type ActiveCountry = string;
// SelectedView is re-exported from nav.ts for external use
export type { SelectedView };

export type ForecastState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "generating" }
  | { status: "loaded"; data: ForecastResponse }
  | { status: "error"; message: string };

const CHAT_OPEN_KEY = "tax-chat-open";
const CHAT_HISTORY_KEY = "tax-chat-history";
const DEMO_RESPONSE = `This is a demo with sample data. To chat about your own tax returns, clone and run [TaxLens](https://github.com/harshitbshah/taxlens) locally:
\`\`\`
git clone https://github.com/harshitbshah/taxlens
cd taxlens
bun install
bun run dev
\`\`\`
You'll need [Bun](https://bun.sh) and an [Anthropic API key](https://console.anthropic.com).`;

function loadChatMessages(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return [];
}

function saveChatMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
  } catch {}
}

interface AppState {
  returns: Record<number, TaxReturn>;
  countryReturns: Record<string, Record<number, unknown>>;
  hasStoredKey: boolean;
  selectedYear: SelectedView;
  activeCountry: ActiveCountry;
  isLoading: boolean;
  hasUserData: boolean;
  isDemo: boolean;
  isDev: boolean;
}

async function fetchInitialState(): Promise<
  Pick<AppState, "returns" | "countryReturns" | "hasStoredKey" | "hasUserData" | "isDemo" | "isDev">
> {
  if (isHostedEnvironment()) {
    return {
      hasStoredKey: false,
      returns: {},
      countryReturns: {},
      hasUserData: false,
      isDemo: true,
      isDev: false,
    };
  }

  const nonUsCodes = Object.keys(CLIENT_REGISTRY).filter((c) => c !== "us");
  const [configRes, returnsRes, ...countryResults] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/returns"),
    ...nonUsCodes.map((code) => fetch(`/api/${code}/returns`)),
  ]);
  const { hasKey, isDemo, isDev } = await configRes.json();
  const returns = await returnsRes.json();
  const countryReturns: Record<string, Record<number, unknown>> = {};
  for (let i = 0; i < nonUsCodes.length; i++) {
    const res = countryResults[i];
    if (res?.ok) countryReturns[nonUsCodes[i]!] = await res.json();
  }
  const hasUserData = Object.keys(returns).length > 0;
  return {
    hasStoredKey: hasKey,
    returns,
    countryReturns,
    hasUserData,
    isDemo: isDemo ?? false,
    isDev: isDev ?? false,
  };
}

export function App() {
  const [state, setState] = useState<AppState>({
    returns: sampleReturns,
    countryReturns: {},
    hasStoredKey: false,
    selectedYear: "summary",
    activeCountry: "us",
    isLoading: true,
    hasUserData: false,
    isDemo: isHostedEnvironment(),
    isDev: false,
  });
  const [forecastStates, setForecastStates] = useState<Record<string, ForecastState>>({});
  const [forecastProfiles, setForecastProfiles] = useState<Record<string, ForecastProfile>>({});
  const [retirementAccounts, setRetirementAccounts] = useState<AllRetirementAccounts>({});
  const [devDemoOverride, setDevDemoOverride] = useState<boolean | null>(getDevDemoOverride);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [_isUploading, setIsUploading] = useState(false);
  const [configureKeyOnly, setConfigureKeyOnly] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    if (stored !== null) return stored === "true";
    return typeof window !== "undefined" && window.innerWidth >= 768;
  });
  const [openModal, setOpenModal] = useState<"settings" | "reset" | "onboarding" | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [isOnboardingProcessing, setIsOnboardingProcessing] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState<FileProgress[]>([]);
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [devTriggerError, setDevTriggerError] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => loadChatMessages());
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [pendingAutoMessage, setPendingAutoMessage] = useState<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const hasShownOnboardingRef = useRef(false);
  const indiaUploadRef = useRef<HTMLInputElement>(null);
  const effectiveIsDemo = resolveDemoMode(devDemoOverride, state.isDemo);
  const shouldShowChat = !effectiveIsDemo || !isMobile;
  const effectiveReturns = effectiveIsDemo ? sampleReturns : state.returns;
  const effectiveCountryReturns = useMemo(
    () => (effectiveIsDemo ? {} : state.countryReturns),
    [effectiveIsDemo, state.countryReturns],
  );
  // Typed alias for components that still expect Record<number, IndianTaxReturn>
  const effectiveIndiaReturns = (effectiveCountryReturns["india"] ?? {}) as Record<
    number,
    IndianTaxReturn
  >;

  const activeCountries = [
    ...(Object.keys(effectiveReturns).length > 0 ? ["us"] : []),
    ...Object.entries(effectiveCountryReturns)
      .filter(([, data]) => Object.keys(data).length > 0)
      .map(([code]) => code),
  ];

  const activePlugin = CLIENT_REGISTRY[state.activeCountry];
  const activeReturns = useMemo<Record<number, unknown>>(
    () =>
      state.activeCountry === "us"
        ? effectiveReturns
        : (effectiveCountryReturns[state.activeCountry] ?? {}),
    [state.activeCountry, effectiveReturns, effectiveCountryReturns],
  );

  const navItems = useMemo(
    () =>
      activePlugin
        ? buildNavItems(activeReturns, {
            yearLabel: activePlugin.yearLabel,
            summaryLabel: activePlugin.summaryLabel,
          })
        : [],
    [activePlugin, activeReturns],
  );

  useEffect(() => {
    fetch("/api/retirement-accounts")
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: AllRetirementAccounts) => setRetirementAccounts(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchInitialState()
      .then(({ returns, countryReturns, hasStoredKey, hasUserData, isDemo, isDev }) => {
        const effectiveReturns = hasUserData ? returns : sampleReturns;
        setState({
          returns: effectiveReturns,
          countryReturns,
          hasStoredKey,
          selectedYear: getDefaultUsSelection(effectiveReturns),
          activeCountry: "us",
          isLoading: false,
          hasUserData,
          isDemo,
          isDev,
        });
      })
      .catch((err) => {
        console.error("Failed to load:", err);
        setState((s) => ({ ...s, isLoading: false }));
      });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Fetch the forecast profile for a country the first time it's needed
  useEffect(() => {
    if (state.isLoading) return;
    const country = state.activeCountry;
    if (forecastProfiles[country] !== undefined) return; // already fetched
    fetch(`/api/forecast-profile?country=${country}`)
      .then(async (res) => {
        if (res.ok) {
          const data = (await res.json()) as ForecastProfile;
          setForecastProfiles((prev) => ({ ...prev, [country]: data }));
        }
      })
      .catch(() => {
        // non-fatal — profile is optional
      });
  }, [state.activeCountry, state.isLoading, forecastProfiles]);

  // Fetch the forecast for a country the first time it's needed (on country switch or after load)
  useEffect(() => {
    if (state.isLoading) return;
    const country = state.activeCountry;
    if (forecastStates[country]) return; // already fetched
    setForecastStates((prev) => ({ ...prev, [country]: { status: "loading" } }));
    fetch(`/api/forecast?country=${country}`)
      .then(async (res) => {
        if (res.status === 404) {
          setForecastStates((prev) => ({ ...prev, [country]: { status: "empty" } }));
        } else if (res.ok) {
          const data = (await res.json()) as ForecastResponse;
          setForecastStates((prev) => ({ ...prev, [country]: { status: "loaded", data } }));
        } else {
          setForecastStates((prev) => ({
            ...prev,
            [country]: { status: "error", message: `Failed to load forecast (HTTP ${res.status})` },
          }));
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Could not reach server";
        setForecastStates((prev) => ({ ...prev, [country]: { status: "error", message } }));
      });
  }, [state.activeCountry, state.isLoading, forecastStates]);

  async function handleGenerateForecast(regenerate = false) {
    const country = state.activeCountry;
    setForecastStates((prev) => ({ ...prev, [country]: { status: "generating" } }));
    try {
      const res = await fetch(`/api/forecast?country=${country}`, { method: "POST" });
      if (!res.ok) {
        let message = `Server error ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // non-JSON error body — use status code message
        }
        setForecastStates((prev) => ({ ...prev, [country]: { status: "error", message } }));
        return;
      }
      const data = (await res.json()) as ForecastResponse;
      setForecastStates((prev) => ({ ...prev, [country]: { status: "loaded", data } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error — is the server running?";
      setForecastStates((prev) => ({
        ...prev,
        [country]: {
          status: "error",
          message: regenerate ? `Regeneration failed: ${message}` : message,
        },
      }));
    }
  }

  async function handleSaveProfile(profile: ForecastProfile) {
    const country = state.activeCountry;
    await fetch(`/api/forecast-profile?country=${country}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setForecastProfiles((prev) => ({ ...prev, [country]: profile }));
  }

  async function handleSaveRetirementAccounts(year: number, accounts: RetirementAccountsYear) {
    await fetch(`/api/retirement-accounts?year=${year}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accounts),
    });
    setRetirementAccounts((prev) => ({ ...prev, [year]: accounts }));
  }

  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_KEY, String(isChatOpen));
  }, [isChatOpen]);

  useEffect(() => {
    saveChatMessages(chatMessages);
  }, [chatMessages]);

  useEffect(() => {
    if (pendingAutoMessage && isChatOpen && !isChatLoading) {
      submitChatMessage(pendingAutoMessage);
      setPendingAutoMessage(null);
    }
    // submitChatMessage is recreated each render; including it would cause an infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoMessage, isChatOpen, isChatLoading]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentId = state.selectedYear === "summary" ? "summary" : String(state.selectedYear);
      const selectedIndex = navItems.findIndex((item) => item.id === currentId);

      if (e.key === "j" && selectedIndex < navItems.length - 1) {
        const nextItem = navItems[selectedIndex + 1];
        if (nextItem) setState((s) => ({ ...s, selectedYear: parseSelectedId(nextItem.id) }));
      }
      if (e.key === "k" && selectedIndex > 0) {
        const prevItem = navItems[selectedIndex - 1];
        if (prevItem) setState((s) => ({ ...s, selectedYear: parseSelectedId(prevItem.id) }));
      }
    },
    [state.selectedYear, navItems],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function processUpload(file: File, apiKey: string): Promise<TaxReturn> {
    const formData = new FormData();
    formData.append("pdf", file);
    if (apiKey) formData.append("apiKey", apiKey);

    const res = await fetch("/api/parse", { method: "POST", body: formData });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }

    const taxReturn: TaxReturn = await res.json();
    const returnsRes = await fetch("/api/returns");
    const returns = await returnsRes.json();

    setState((s) => ({
      ...s,
      returns,
      hasStoredKey: true,
      hasUserData: true,
      selectedYear: s.selectedYear === "summary" ? "summary" : taxReturn.year,
    }));

    return taxReturn;
  }

  async function _handleUploadFromSidebar(files: File[]) {
    if (files.length === 0) return;

    if (!state.hasStoredKey) {
      setPendingFiles(files);
      setIsModalOpen(true);
      return;
    }

    const newPendingUploads: PendingUpload[] = files.map((file) => {
      const filenameYear = extractYearFromFilename(file.name);
      return {
        id: crypto.randomUUID(),
        filename: file.name,
        year: filenameYear,
        status: filenameYear ? "parsing" : "extracting-year",
        file,
      };
    });

    setPendingUploads((prev) => [...prev, ...newPendingUploads]);

    const firstPending = newPendingUploads[0];
    if (firstPending) {
      setState((s) => ({ ...s, selectedYear: `pending:${firstPending.id}` }));
    }

    await Promise.all(
      newPendingUploads
        .filter((p) => !p.year)
        .map(async (pending) => {
          try {
            const formData = new FormData();
            formData.append("pdf", pending.file);
            const yearRes = await fetch("/api/extract-year", { method: "POST", body: formData });
            const { year: extractedYear } = await yearRes.json();
            setPendingUploads((prev) =>
              prev.map((p) =>
                p.id === pending.id ? { ...p, year: extractedYear, status: "parsing" } : p,
              ),
            );
          } catch (err) {
            console.error("Year extraction failed:", err);
            setPendingUploads((prev) =>
              prev.map((p) => (p.id === pending.id ? { ...p, status: "parsing" } : p)),
            );
          }
        }),
    );

    setIsUploading(true);
    let successfulUploads = 0;
    for (const pending of newPendingUploads) {
      try {
        await processUpload(pending.file, "");
        successfulUploads++;
        setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
      } catch (err) {
        console.error("Upload failed:", err);
        setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
      }
    }
    setIsUploading(false);

    setState((s) => ({ ...s, selectedYear: getDefaultUsSelection(s.returns) }));

    if (successfulUploads > 0) {
      const autoMessage =
        files.length === 1
          ? "Help me understand my year"
          : "Help me understand my history of income and taxes";
      setPendingAutoMessage(autoMessage);
      setIsChatOpen(true);
    }
  }

  async function handleUploadFromModal(files: File[], apiKey: string) {
    for (const file of files) await processUpload(file, apiKey);
    setPendingFiles([]);
  }

  async function handleSaveApiKey(apiKey: string) {
    const res = await fetch("/api/config/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    setState((s) => ({ ...s, hasStoredKey: true }));
  }

  async function handleUploadCountryReturn(country: string, file: File) {
    if (!state.hasStoredKey) return;
    const plugin = CLIENT_REGISTRY[country];
    if (!plugin) return;
    const formData = new FormData();
    formData.append("pdf", file);
    const res = await fetch(`/api/${country}/parse`, { method: "POST", body: formData });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    const result = await res.json();
    const year = plugin.getYear(result);
    const refreshed = await fetch(`/api/${country}/returns`);
    const countryData = await refreshed.json();
    setState((s) => ({
      ...s,
      countryReturns: { ...s.countryReturns, [country]: countryData },
      activeCountry: country,
      selectedYear: year,
    }));
  }

  async function handleDeleteCountryReturn(country: string, year: number) {
    await fetch(`/api/${country}/returns/${year}`, { method: "DELETE" });
    setState((s) => {
      const countryData = { ...(s.countryReturns[country] ?? {}) };
      delete countryData[year];
      const hasAny = Object.keys(countryData).length > 0;
      return {
        ...s,
        countryReturns: { ...s.countryReturns, [country]: countryData },
        activeCountry: hasAny ? s.activeCountry : "us",
        selectedYear: hasAny ? getDefaultSelection(countryData) : getDefaultUsSelection(s.returns),
      };
    });
  }

  function handleSwitchCountry(country: string) {
    const returns = country === "us" ? effectiveReturns : (effectiveCountryReturns[country] ?? {});
    const newSelection = getDefaultSelection(returns);
    setState((s) => ({ ...s, activeCountry: country, selectedYear: newSelection }));
  }

  async function handleClearData() {
    const res = await fetch("/api/clear-data", { method: "POST" });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    setState((s) => ({
      returns: sampleReturns,
      countryReturns: {},
      hasStoredKey: false,
      selectedYear: "summary",
      activeCountry: "us",
      isLoading: false,
      hasUserData: false,
      isDemo: s.isDemo,
      isDev: s.isDev,
    }));
    localStorage.removeItem(CHAT_OPEN_KEY);
    localStorage.removeItem(CHAT_HISTORY_KEY);
    localStorage.removeItem("tax-chat-width");
    setChatMessages([]);
    setIsChatOpen(true);
  }

  async function submitChatMessage(prompt: string) {
    if (!prompt || isChatLoading) return;

    setFollowUpSuggestions([]);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setIsChatLoading(true);

    if (effectiveIsDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: DEMO_RESPONSE,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
      setIsChatLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          history: chatMessages,
          returns: activeReturns,
          selectedYear: state.selectedYear,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || `HTTP ${res.status}`);
      }

      const { response } = await res.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
      };

      setChatMessages((prev) => [...prev, assistantMessage]);

      setIsLoadingSuggestions(true);
      fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: [...chatMessages, userMessage, assistantMessage],
          returns: activeReturns,
        }),
      })
        .then((res) => res.json())
        .then(({ suggestions }) => setFollowUpSuggestions(suggestions || []))
        .catch(() => setFollowUpSuggestions([]))
        .finally(() => setIsLoadingSuggestions(false));
    } catch (err) {
      console.error("Chat error:", err);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Failed to get response"}`,
      };
      setChatMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  }

  function handleNewChat() {
    setChatMessages([]);
    saveChatMessages([]);
    setFollowUpSuggestions([]);
  }

  function handleSelect(id: string) {
    setState((s) => ({ ...s, selectedYear: parseSelectedId(id) }));
  }

  async function handleDelete(id: string) {
    if (state.activeCountry !== "us") {
      const year = Number(id);
      if (!isNaN(year)) await handleDeleteCountryReturn(state.activeCountry, year);
      return;
    }

    const year = Number(id);
    if (isNaN(year)) return;

    await fetch(`/api/returns/${year}`, { method: "DELETE" });

    const isLastYear = Object.keys(state.returns).length === 1;

    setState((s) => {
      const newReturns = { ...s.returns };
      delete newReturns[year];

      if (isLastYear) {
        return { ...s, returns: sampleReturns, selectedYear: "summary", hasUserData: false };
      }

      const newSelection =
        s.selectedYear === year ? getDefaultUsSelection(newReturns) : s.selectedYear;
      return { ...s, returns: newReturns, selectedYear: newSelection };
    });

    if (isLastYear) setOpenModal("onboarding");
  }

  if (state.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-sm text-(--color-text-muted)">Loading...</span>
      </div>
    );
  }

  const selectedId =
    typeof state.selectedYear === "string" ? state.selectedYear : String(state.selectedYear);

  const selectedPendingUpload =
    typeof state.selectedYear === "string" && state.selectedYear.startsWith("pending:")
      ? pendingUploads.find((p) => `pending:${p.id}` === state.selectedYear)
      : null;

  function renderMainPanel() {
    const selectedYearNum: "summary" | "forecast" | number =
      state.selectedYear === "forecast"
        ? "forecast"
        : typeof state.selectedYear === "number"
          ? state.selectedYear
          : "summary";

    const commonProps = {
      activeCountry: state.activeCountry,
      activeReturns,
      indiaReturns: effectiveIndiaReturns,
      selectedYear: selectedYearNum,
    };

    const usViewProps = {
      retirementAccounts,
      onSaveRetirementAccounts: handleSaveRetirementAccounts,
    };

    if (selectedPendingUpload) {
      return <MainPanel view="loading" pendingUpload={selectedPendingUpload} {...commonProps} />;
    }
    if (state.selectedYear === "forecast") {
      return (
        <MainPanel
          view="forecast"
          forecastState={forecastStates[state.activeCountry] ?? { status: "loading" }}
          onGenerateForecast={handleGenerateForecast}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          forecastProfile={forecastProfiles[state.activeCountry] ?? null}
          onSaveProfile={handleSaveProfile}
          {...commonProps}
        />
      );
    }
    if (state.selectedYear === "summary") {
      return <MainPanel view="summary" {...commonProps} {...usViewProps} />;
    }
    if (typeof state.selectedYear === "number") {
      const yearLabel = activePlugin?.yearLabel(state.selectedYear) ?? String(state.selectedYear);
      if (activeReturns[state.selectedYear]) {
        return <MainPanel view="receipt" title={yearLabel} {...commonProps} {...usViewProps} />;
      }
    }
    return <MainPanel view="summary" {...commonProps} {...usViewProps} />;
  }

  const showOnboarding =
    isOnboardingProcessing ||
    openModal === "onboarding" ||
    (!effectiveIsDemo && !onboardingDismissed && !state.hasStoredKey && !state.hasUserData);

  const skipOnboardingAnimation =
    showOnboarding && !hasShownOnboardingRef.current && openModal !== "onboarding";
  if (showOnboarding && !hasShownOnboardingRef.current) {
    hasShownOnboardingRef.current = true;
  }

  function getPostUploadNavigation(
    existingYears: number[],
    uploadedYears: number[],
    batchSize: number,
  ): SelectedView {
    if (uploadedYears.length === 0) return "summary";
    if (batchSize === 1) return uploadedYears[0]!;
    return "summary";
  }

  async function handleOnboardingUpload(files: FileWithId[], apiKey: string) {
    setIsOnboardingProcessing(true);
    const existingYears = Object.keys(state.returns).map(Number);

    const progress: FileProgress[] = files.map((f) => ({
      id: f.id,
      filename: f.file.name,
      status: "pending" as const,
    }));
    setOnboardingProgress(progress);

    if (!state.hasStoredKey && apiKey) await handleSaveApiKey(apiKey);

    const uploadedYears: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const fileWithId = files[i]!;
      const file = fileWithId.file;
      const id = fileWithId.id;

      setOnboardingProgress((p) => p.map((f) => (f.id === id ? { ...f, status: "parsing" } : f)));

      try {
        const taxReturn = await processUpload(file, apiKey);
        uploadedYears.push(taxReturn.year);
        setOnboardingProgress((p) =>
          p.map((f) => (f.id === id ? { ...f, status: "complete", year: taxReturn.year } : f)),
        );
      } catch (err) {
        setOnboardingProgress((p) =>
          p.map((f) =>
            f.id === id
              ? { ...f, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : f,
          ),
        );
      }
    }

    const nav = getPostUploadNavigation(existingYears, uploadedYears, files.length);
    setState((s) => ({ ...s, selectedYear: nav }));

    setIsOnboardingProcessing(false);
    setOpenModal(null);
    setOnboardingProgress([]);

    if (uploadedYears.length > 0) {
      const autoMessage =
        files.length === 1
          ? "Help me understand my year"
          : "Help me understand my history of income and taxes";
      setPendingAutoMessage(autoMessage);
      setIsChatOpen(true);
    }
  }

  function handleOnboardingClose() {
    setOpenModal(null);
    setOnboardingDismissed(true);
  }

  if (devTriggerError) throw new Error("Test error triggered from dev tools");

  return (
    <div className="flex h-screen">
      <input
        ref={indiaUploadRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            await handleUploadCountryReturn("india", file);
            e.target.value = "";
          }
        }}
      />
      <Sidebar
        navItems={navItems}
        selectedId={selectedId}
        activeCountry={state.activeCountry}
        activeCountries={activeCountries}
        onSelect={handleSelect}
        onSwitchCountry={handleSwitchCountry}
        onOpenStart={() => {
          if (state.activeCountry === "india") {
            indiaUploadRef.current?.click();
          } else {
            setOpenModal("onboarding");
          }
        }}
        onOpenReset={() => setOpenModal("reset")}
        onDeleteYear={handleDelete}
        isDemo={effectiveIsDemo}
        hasUserData={state.hasUserData}
        hasStoredKey={state.hasStoredKey}
        isChatOpen={isChatOpen}
        isChatLoading={isChatLoading}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
      />
      <ErrorBoundary name="Main Panel">{renderMainPanel()}</ErrorBoundary>

      {shouldShowChat && isChatOpen && (
        <ErrorBoundary name="Chat">
          <Chat
            messages={chatMessages}
            isLoading={isChatLoading}
            hasApiKey={state.hasStoredKey}
            isDemo={effectiveIsDemo}
            onSubmit={submitChatMessage}
            onNewChat={handleNewChat}
            onClose={() => setIsChatOpen(false)}
            followUpSuggestions={followUpSuggestions}
            isLoadingSuggestions={isLoadingSuggestions}
          />
        </ErrorBoundary>
      )}

      {effectiveIsDemo ? (
        <DemoDialog
          isOpen={showOnboarding}
          onClose={handleOnboardingClose}
          skipOpenAnimation={skipOnboardingAnimation}
        />
      ) : (
        <SetupDialog
          isOpen={showOnboarding}
          onUpload={handleOnboardingUpload}
          onClose={handleOnboardingClose}
          isProcessing={isOnboardingProcessing}
          fileProgress={onboardingProgress}
          hasStoredKey={state.hasStoredKey}
          existingYears={state.hasUserData ? Object.keys(state.returns).map(Number) : []}
          skipOpenAnimation={skipOnboardingAnimation}
        />
      )}

      <UploadModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPendingFiles([]);
          setConfigureKeyOnly(false);
        }}
        onUpload={handleUploadFromModal}
        onSaveApiKey={handleSaveApiKey}
        hasStoredKey={state.hasStoredKey}
        pendingFiles={pendingFiles}
        configureKeyOnly={configureKeyOnly}
      />

      <SettingsModal
        isOpen={openModal === "settings"}
        onClose={() => setOpenModal(null)}
        hasApiKey={state.hasStoredKey}
        onSaveApiKey={handleSaveApiKey}
        onClearData={handleClearData}
      />

      <ResetDialog
        isOpen={openModal === "reset"}
        onClose={() => setOpenModal(null)}
        onReset={handleClearData}
      />

      {effectiveIsDemo && !showOnboarding && (
        <>
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-90 h-96 bg-linear-to-t from-white to-transparent md:h-128 dark:from-black" />
          <button
            onClick={() => setOpenModal("onboarding")}
            className="dark:shadow-contrast fixed right-8 bottom-8 left-8 z-100 flex cursor-pointer flex-col gap-3 rounded-2xl bg-black p-4 text-white shadow-md ring-[0.5px] ring-black/10 md:max-w-lg md:p-6 dark:bg-neutral-900"
          >
            <div className="mb-2 flex flex-col items-start justify-start text-left text-lg">
              <span className="font-semibold text-white">TaxLens</span>
              <span className="font-medium opacity-70">
                Visualize and chat with your tax returns.
              </span>
            </div>
            <span className="self-start rounded-lg bg-(--color-brand) px-3 py-1.5 text-base font-semibold text-neutral-900 text-white">
              Get started
            </span>
          </button>
        </>
      )}

      {state.isDev && (
        <DevTools
          devDemoOverride={devDemoOverride}
          onDemoOverrideChange={setDevDemoOverride}
          onTriggerError={() => setDevTriggerError(true)}
        />
      )}
    </div>
  );
}
