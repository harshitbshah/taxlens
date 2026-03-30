import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { setDevDemoOverride } from "../lib/env";
import { SetupDialogPreview } from "./SetupDialogPreview";

export function cycleDemoOverride(current: boolean | null): boolean | null {
  if (current === null) return true;
  if (current === true) return false;
  return null;
}

function getDemoOverrideLabel(value: boolean | null): string {
  if (value === null) return "demo: auto";
  return value ? "demo: on" : "demo: off";
}

interface DevToolsProps {
  devDemoOverride: boolean | null;
  onDemoOverrideChange: (value: boolean | null) => void;
  onTriggerError: () => void;
}

export function DevTools({ devDemoOverride, onDemoOverrideChange, onTriggerError }: DevToolsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handleDemoToggle = useCallback(() => {
    const newValue = cycleDemoOverride(devDemoOverride);
    setDevDemoOverride(newValue);
    onDemoOverrideChange(newValue);
  }, [devDemoOverride, onDemoOverrideChange]);

  useHotkeys("mod+shift+period", () => setIsVisible((v) => !v), {
    preventDefault: true,
  });

  useHotkeys("shift+d", handleDemoToggle, {
    preventDefault: true,
  });

  if (!isVisible) return null;

  return (
    <>
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-1.5 rounded-lg border border-(--color-border) bg-white p-2 shadow-lg dark:bg-zinc-900">
        <button
          onClick={handleDemoToggle}
          className="rounded border border-(--color-border) bg-(--color-bg-muted) px-2 py-1 font-mono text-xs text-(--color-text-muted) hover:border-(--color-text-muted) hover:text-(--color-text)"
        >
          {getDemoOverrideLabel(devDemoOverride)}
          <span className="ml-1.5 opacity-50">Shift+D</span>
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className="rounded border border-(--color-border) bg-(--color-bg-muted) px-2 py-1 font-mono text-xs text-(--color-text-muted) hover:border-(--color-text-muted) hover:text-(--color-text)"
        >
          preview states
        </button>
        <button
          onClick={onTriggerError}
          className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 font-mono text-xs text-red-500 hover:border-red-500/50 hover:bg-red-500/20"
        >
          trigger error
        </button>
      </div>
      {showPreview && <SetupDialogPreview onClose={() => setShowPreview(false)} />}
    </>
  );
}
