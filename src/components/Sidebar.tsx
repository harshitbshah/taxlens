import { CLIENT_REGISTRY } from "../countries/views";
import { cn } from "../lib/cn";
import { getMostRecentYearItem } from "../lib/nav";
import type { NavItem } from "../lib/types";
import { Button } from "./Button";
import { FilePlusIcon } from "./FilePlusIcon";
import { itemBaseClassName, Menu, MenuItem } from "./Menu";
import { TrashIcon } from "./TrashIcon";

interface Props {
  navItems: NavItem[];
  selectedId: string;
  activeCountry: string;
  activeCountries: string[];
  onSelect: (id: string) => void;
  onSwitchCountry: (country: string) => void;
  onOpenStart: () => void;
  onOpenReset: () => void;
  onUploadIndia?: () => void;
  onDeleteYear?: (year: string) => void;
  isDemo: boolean;
  hasUserData: boolean;
  hasStoredKey: boolean;
  isChatOpen: boolean;
  isChatLoading?: boolean;
  onToggleChat: () => void;
}

function SidebarNavItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm transition-colors",
        isActive
          ? "bg-(--color-bg-muted) font-medium text-(--color-text)"
          : "text-(--color-text-muted) hover:bg-(--color-bg-muted) hover:text-(--color-text)",
      )}
    >
      {label}
    </button>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      <div className="mb-1 px-1 text-[10px] font-semibold tracking-widest text-(--color-text-muted) uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

export function Sidebar({
  navItems,
  selectedId,
  activeCountry,
  activeCountries,
  onSelect,
  onSwitchCountry,
  onOpenStart,
  onOpenReset,
  onUploadIndia,
  onDeleteYear: _onDeleteYear,
  isDemo,
  hasUserData,
  hasStoredKey,
  isChatOpen,
  isChatLoading,
  onToggleChat,
}: Props) {
  const yearItems = navItems.filter((item) => item.id !== "summary");
  const isYearSelected = yearItems.some((item) => item.id === selectedId);

  function handleByYearClick() {
    if (isYearSelected) return;
    const mostRecent = getMostRecentYearItem(navItems);
    if (mostRecent) onSelect(mostRecent.id);
  }

  const multiCountry = activeCountries.length > 1;

  return (
    <aside className="flex h-screen w-48 shrink-0 flex-col overflow-hidden border-r border-(--color-border) bg-(--color-bg)">
      {/* Logo */}
      <div className="flex h-12 shrink-0 items-center border-b border-(--color-border) px-4">
        <span className="text-sm font-semibold text-(--color-text)">TaxLens</span>
        <span className="ml-1.5 rounded bg-(--color-bg-muted) px-1.5 py-0.5 text-[10px] text-(--color-text-muted)">
          beta
        </span>
      </div>

      {/* Country toggle */}
      {multiCountry && (
        <div className="flex gap-1 border-b border-(--color-border) p-3">
          {activeCountries.map((code) => {
            const plugin = CLIENT_REGISTRY[code];
            if (!plugin) return null;
            return (
              <button
                key={code}
                onClick={() => onSwitchCountry(code)}
                className={cn(
                  "flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  activeCountry === code
                    ? "bg-(--color-bg-muted) text-(--color-text)"
                    : "text-(--color-text-muted) hover:text-(--color-text)",
                )}
              >
                {plugin.flag} {plugin.name.split(" ")[0]}
              </button>
            );
          })}
        </div>
      )}

      {/* Scrollable nav area */}
      <div className="flex-1 overflow-y-auto">
        {/* Views section */}
        <SidebarSection title="Views">
          <SidebarNavItem
            label="Summary"
            isActive={selectedId === "summary"}
            onClick={() => onSelect("summary")}
          />
          <SidebarNavItem label="By Year" isActive={isYearSelected} onClick={handleByYearClick} />
          <SidebarNavItem
            label="Forecast"
            isActive={selectedId === "forecast"}
            onClick={() => onSelect("forecast")}
          />
        </SidebarSection>

        {/* Years section */}
        {yearItems.length > 0 && (
          <SidebarSection title="Years">
            {yearItems.map((item) => (
              <SidebarNavItem
                key={item.id}
                label={item.label}
                isActive={selectedId === item.id}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </SidebarSection>
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-(--color-border) p-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleChat}
          className={cn("flex items-center gap-1.5 text-xs", isChatOpen && "text-(--color-text)")}
        >
          {isChatLoading ? (
            <span className="animate-pulse">●</span>
          ) : (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          )}
          Chat
        </Button>

        <Menu
          popupClassName="min-w-[180px]"
          side="top"
          align="end"
          sideOffset={4}
          trigger={
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-label="Actions"
            >
              <circle cx="8" cy="3" r="1" fill="currentColor" stroke="none" />
              <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
              <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
            </svg>
          }
        >
          <MenuItem onClick={onOpenStart}>
            <FilePlusIcon />
            {hasUserData ? "Add return" : "Get started"}
          </MenuItem>
          {!isDemo && hasStoredKey && onUploadIndia && (
            <MenuItem onClick={onUploadIndia}>
              <FilePlusIcon />
              Import India ITR
            </MenuItem>
          )}
          {!isDemo && (hasUserData || hasStoredKey) && (
            <MenuItem
              onClick={onOpenReset}
              className={cn(
                itemBaseClassName,
                "text-red-500 data-[highlighted]:bg-red-50 dark:data-[highlighted]:bg-red-950",
              )}
            >
              <TrashIcon />
              Reset data
            </MenuItem>
          )}
        </Menu>
      </div>
    </aside>
  );
}
