import "./index.css";

import { useCallback, useEffect, useRef, useState } from "react";

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
import { sampleReturns } from "./data/sampleData";
import { isElectron } from "./lib/electron";
import { getDevDemoOverride, isHostedEnvironment, resolveDemoMode } from "./lib/env";
import type { ForecastResponse } from "./lib/forecaster";
import {
  buildIndiaNavItems,
  buildUsNavItems,
  getDefaultIndiaSelection,
  getDefaultUsSelection,
  parseSelectedId,
  type SelectedView,
} from "./lib/nav";
import type {
  FileProgress,
  FileWithId,
  IndianTaxReturn,
  PendingUpload,
  TaxReturn,
} from "./lib/schema";
import { extractYearFromFilename } from "./lib/year-extractor";

export type UpdateStatus = "available" | "downloading" | "ready";
export type ActiveCountry = "us" | "india";
// SelectedView is re-exported from nav.ts for external use
export type { SelectedView };

export type ForecastState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "generating" }
  | { status: "loaded"; data: ForecastResponse }
  | { status: "error"; message: string };

function useElectronUpdater(devOverride: UpdateStatus | null) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isElectron()) return;
    const api = window.electronAPI?.update;
    if (!api) return;

    const unsubs: (() => void)[] = [];

    if (api.onAvailable) {
      unsubs.push(
        api.onAvailable((data) => {
          setVersion(data.version);
          setStatus("available");
        }),
      );
    }
    if (api.onProgress) {
      unsubs.push(
        api.onProgress((data) => {
          setStatus("downloading");
          setProgress(Math.round(data.percent));
        }),
      );
    }
    if (api.onDownloaded) {
      unsubs.push(
        api.onDownloaded(() => {
          setStatus("ready");
        }),
      );
    }
    if (api.onError) {
      unsubs.push(
        api.onError((data) => {
          console.error("Auto-update error:", data.message);
          setStatus(null);
        }),
      );
    }

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const effective = devOverride ?? status;

  if (!effective) return null;

  return {
    status: effective,
    version: devOverride ? "0.0.0-dev" : version,
    progress: devOverride === "downloading" ? 42 : progress,
    download: () => window.electronAPI?.update?.download?.(),
    install: () => window.electronAPI?.update?.install?.(),
  };
}

const CHAT_OPEN_KEY = "tax-chat-open";
const CHAT_HISTORY_KEY = "tax-chat-history";
const DEMO_RESPONSE = `This is a demo with sample data. To chat about your own tax returns, clone and run [Tax UI](https://github.com/brianlovin/tax-ui) locally:
\`\`\`
git clone https://github.com/brianlovin/tax-ui
cd tax-ui
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
  indiaReturns: Record<number, IndianTaxReturn>;
  hasStoredKey: boolean;
  selectedYear: SelectedView;
  activeCountry: ActiveCountry;
  isLoading: boolean;
  hasUserData: boolean;
  isDemo: boolean;
  isDev: boolean;
}

async function fetchInitialState(): Promise<
  Pick<AppState, "returns" | "indiaReturns" | "hasStoredKey" | "hasUserData" | "isDemo" | "isDev">
> {
  if (isHostedEnvironment()) {
    return {
      hasStoredKey: false,
      returns: {},
      indiaReturns: {},
      hasUserData: false,
      isDemo: true,
      isDev: false,
    };
  }

  const [configRes, returnsRes, indiaRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/returns"),
    fetch("/api/india/returns"),
  ]);
  const { hasKey, isDemo, isDev } = await configRes.json();
  const returns = await returnsRes.json();
  const indiaReturns = await indiaRes.json();
  const hasUserData = Object.keys(returns).length > 0;
  return {
    hasStoredKey: hasKey,
    returns,
    indiaReturns,
    hasUserData,
    isDemo: isDemo ?? false,
    isDev: isDev ?? false,
  };
}

export function App() {
  const [state, setState] = useState<AppState>({
    returns: sampleReturns,
    indiaReturns: {},
    hasStoredKey: false,
    selectedYear: "summary",
    activeCountry: "us",
    isLoading: true,
    hasUserData: false,
    isDemo: isHostedEnvironment(),
    isDev: false,
  });
  const [forecastState, setForecastState] = useState<ForecastState>({ status: "loading" });
  const [devDemoOverride, setDevDemoOverride] = useState<boolean | null>(getDevDemoOverride);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
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
  const [devUpdateOverride, setDevUpdateOverride] = useState<UpdateStatus | null>(null);
  const updater = useElectronUpdater(devUpdateOverride);

  const effectiveIsDemo = resolveDemoMode(devDemoOverride, state.isDemo);
  const shouldShowChat = !effectiveIsDemo || !isMobile;
  const effectiveReturns = effectiveIsDemo ? sampleReturns : state.returns;
  const effectiveIndiaReturns = effectiveIsDemo ? {} : state.indiaReturns;

  const hasIndiaData = Object.keys(effectiveIndiaReturns).length > 0;

  const navItems =
    state.activeCountry === "india"
      ? buildIndiaNavItems(effectiveIndiaReturns)
      : buildUsNavItems(effectiveReturns);

  useEffect(() => {
    fetchInitialState()
      .then(({ returns, indiaReturns, hasStoredKey, hasUserData, isDemo, isDev }) => {
        const effectiveReturns = hasUserData ? returns : sampleReturns;
        setState({
          returns: effectiveReturns,
          indiaReturns,
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

  useEffect(() => {
    fetch("/api/forecast")
      .then(async (res) => {
        if (res.status === 404) {
          setForecastState({ status: "empty" });
        } else if (res.ok) {
          const data = (await res.json()) as ForecastResponse;
          setForecastState({ status: "loaded", data });
        } else {
          setForecastState({
            status: "error",
            message: `Failed to load forecast (HTTP ${res.status})`,
          });
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Could not reach server";
        setForecastState({ status: "error", message });
      });
  }, []);

  async function handleGenerateForecast(regenerate = false) {
    setForecastState({ status: "generating" });
    try {
      const res = await fetch("/api/forecast", { method: "POST" });
      if (!res.ok) {
        let message = `Server error ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // non-JSON error body — use status code message
        }
        setForecastState({ status: "error", message });
        return;
      }
      const data = (await res.json()) as ForecastResponse;
      setForecastState({ status: "loaded", data });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Network error — is the server running?";
      setForecastState({
        status: "error",
        message: regenerate ? `Regeneration failed: ${message}` : message,
      });
    }
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

  async function handleUploadFromSidebar(files: File[]) {
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

  async function handleUploadIndiaItr(file: File) {
    if (!state.hasStoredKey) return;
    const formData = new FormData();
    formData.append("pdf", file);
    const res = await fetch("/api/india/parse", { method: "POST", body: formData });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    const indiaReturn: IndianTaxReturn = await res.json();
    const indiaRes = await fetch("/api/india/returns");
    const indiaReturns = await indiaRes.json();
    setState((s) => ({
      ...s,
      indiaReturns,
      activeCountry: "india",
      selectedYear: indiaReturn.financialYear,
    }));
  }

  async function handleDeleteIndiaReturn(financialYear: number) {
    await fetch(`/api/india/returns/${financialYear}`, { method: "DELETE" });
    setState((s) => {
      const newIndia = { ...s.indiaReturns };
      delete newIndia[financialYear];
      const hasAnyIndia = Object.keys(newIndia).length > 0;
      return {
        ...s,
        indiaReturns: newIndia,
        // Switch back to US if no India returns remain
        activeCountry: hasAnyIndia ? s.activeCountry : "us",
        selectedYear: hasAnyIndia
          ? getDefaultIndiaSelection(newIndia)
          : getDefaultUsSelection(s.returns),
      };
    });
  }

  function handleSwitchCountry(country: ActiveCountry) {
    const newSelection =
      country === "us"
        ? getDefaultUsSelection(effectiveReturns)
        : getDefaultIndiaSelection(effectiveIndiaReturns);
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
      indiaReturns: {},
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
          returns: effectiveReturns,
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
          returns: effectiveReturns,
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
    if (state.activeCountry === "india") {
      const fy = Number(id);
      if (!isNaN(fy)) await handleDeleteIndiaReturn(fy);
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
    const statsSelectedYear: "summary" | "forecast" | number =
      state.selectedYear === "forecast"
        ? "forecast"
        : typeof state.selectedYear === "number"
          ? state.selectedYear
          : "summary";

    const commonProps = {
      returns: effectiveReturns,
      selectedYear: statsSelectedYear,
      activeCountry: state.activeCountry,
      indiaReturns: effectiveIndiaReturns,
    };

    if (selectedPendingUpload) {
      return <MainPanel view="loading" pendingUpload={selectedPendingUpload} {...commonProps} />;
    }
    if (state.selectedYear === "forecast") {
      return (
        <MainPanel
          view="forecast"
          forecastState={forecastState}
          onGenerateForecast={handleGenerateForecast}
          onToggleChat={() => setIsChatOpen(!isChatOpen)}
          {...commonProps}
        />
      );
    }
    if (state.selectedYear === "summary") {
      return <MainPanel view="summary" {...commonProps} />;
    }
    if (typeof state.selectedYear === "number") {
      if (state.activeCountry === "india") {
        return <MainPanel view="india" financialYear={state.selectedYear} {...commonProps} />;
      }
      const receiptData = effectiveReturns[state.selectedYear];
      if (receiptData) {
        return (
          <MainPanel
            view="receipt"
            data={receiptData}
            title={String(state.selectedYear)}
            {...commonProps}
          />
        );
      }
    }
    return <MainPanel view="summary" {...commonProps} />;
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
            await handleUploadIndiaItr(file);
            e.target.value = "";
          }
        }}
      />
      <Sidebar
        navItems={navItems}
        selectedId={selectedId}
        activeCountry={state.activeCountry}
        hasIndiaData={hasIndiaData}
        onSelect={handleSelect}
        onSwitchCountry={handleSwitchCountry}
        onOpenStart={() => setOpenModal("onboarding")}
        onOpenReset={() => setOpenModal("reset")}
        onUploadIndia={() => indiaUploadRef.current?.click()}
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
              <span className="font-semibold text-white">Tax UI</span>
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

      {updater && (
        <div className="get-started-pill dark:shadow-contrast fixed right-6 bottom-6 z-50 flex h-10 items-center gap-2 rounded-full bg-black pr-1.5 pl-4 text-sm text-white shadow-lg transition-all duration-300 ease-out dark:bg-zinc-800">
          {updater.status === "available" && (
            <>
              <span className="whitespace-nowrap">v{updater.version} available</span>
              <button
                onClick={updater.download}
                className="cursor-pointer rounded-full bg-blue-500 px-3 py-1 text-sm font-medium text-white hover:bg-blue-600"
              >
                Update
              </button>
            </>
          )}
          {updater.status === "downloading" && (
            <span className="pr-2.5 whitespace-nowrap tabular-nums">
              Downloading {updater.progress}%
            </span>
          )}
          {updater.status === "ready" && (
            <>
              <span className="whitespace-nowrap">Update ready</span>
              <button
                onClick={updater.install}
                className="cursor-pointer rounded-full bg-blue-500 px-3 py-1 text-sm font-medium text-white hover:bg-blue-600"
              >
                Restart
              </button>
            </>
          )}
        </div>
      )}

      {state.isDev && (
        <DevTools
          devDemoOverride={devDemoOverride}
          onDemoOverrideChange={setDevDemoOverride}
          onTriggerError={() => setDevTriggerError(true)}
          devUpdateOverride={devUpdateOverride}
          onUpdateOverrideChange={setDevUpdateOverride}
        />
      )}
    </div>
  );
}
