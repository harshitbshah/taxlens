import { useState } from "react";

import { formatCurrency } from "../lib/format";
import {
  DEFAULT_ACCOUNT_NAMES,
  netGainLoss,
  type RetirementAccount,
  type RetirementAccountsYear,
} from "../lib/retirement-accounts-schema";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { PlusIcon } from "./PlusIcon";
import { TrashIcon } from "./TrashIcon";

interface Props {
  year: number;
  accounts: RetirementAccountsYear | null;
  onSave: (accounts: RetirementAccountsYear) => Promise<void>;
}

function emptyAccount(name = ""): RetirementAccount {
  return { name, shortTermGains: 0, shortTermLosses: 0, longTermGains: 0, longTermLosses: 0 };
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] text-(--color-text-muted)">{label}</label>
      <div className="relative">
        <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xs text-(--color-text-muted)">
          $
        </span>
        <input
          type="number"
          min={0}
          value={value || ""}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          placeholder="0"
          className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-muted) py-2 pr-3 pl-6 text-sm focus:border-(--color-text-muted) focus:outline-none"
        />
      </div>
    </div>
  );
}

function AccountEditor({
  account,
  onChange,
  onRemove,
  showRemove,
}: {
  account: RetirementAccount;
  onChange: (a: RetirementAccount) => void;
  onRemove: () => void;
  showRemove: boolean;
}) {
  function set(key: keyof RetirementAccount, value: string | number) {
    onChange({ ...account, [key]: value });
  }

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-muted) p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <input
          type="text"
          value={account.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Account name"
          className="flex-1 rounded-lg border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-sm font-medium focus:border-(--color-text-muted) focus:outline-none"
        />
        {showRemove && (
          <button
            onClick={onRemove}
            className="cursor-pointer rounded p-1 text-(--color-text-muted) hover:text-red-500"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Short-term gains"
          value={account.shortTermGains}
          onChange={(v) => set("shortTermGains", v)}
        />
        <NumberField
          label="Short-term losses"
          value={account.shortTermLosses}
          onChange={(v) => set("shortTermLosses", v)}
        />
        <NumberField
          label="Long-term gains"
          value={account.longTermGains}
          onChange={(v) => set("longTermGains", v)}
        />
        <NumberField
          label="Long-term losses"
          value={account.longTermLosses}
          onChange={(v) => set("longTermLosses", v)}
        />
      </div>
      <div className="mt-3 border-t border-(--color-border) pt-2 text-right text-xs text-(--color-text-muted)">
        Net:{" "}
        <span
          className={
            netGainLoss(account) >= 0 ? "font-medium text-emerald-600" : "font-medium text-red-500"
          }
        >
          {netGainLoss(account) >= 0 ? "+" : ""}
          {formatCurrency(netGainLoss(account))}
        </span>
      </div>
    </div>
  );
}

export function RetirementAccountsSection({ year, accounts, onSave }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<RetirementAccountsYear>([]);
  const [isSaving, setIsSaving] = useState(false);

  function openDialog() {
    setDraft(
      accounts && accounts.length > 0
        ? accounts.map((a) => ({ ...a }))
        : DEFAULT_ACCOUNT_NAMES.map(emptyAccount),
    );
    setIsOpen(true);
  }

  function updateAccount(i: number, updated: RetirementAccount) {
    setDraft((prev) => prev.map((a, idx) => (idx === i ? updated : a)));
  }

  function removeAccount(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addAccount() {
    setDraft((prev) => [...prev, emptyAccount()]);
  }

  async function handleSave() {
    const filled = draft.filter((a) => a.name.trim());
    setIsSaving(true);
    try {
      await onSave(filled);
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  const hasData = accounts && accounts.length > 0;

  return (
    <>
      <div className="mx-auto max-w-2xl px-6 pb-8">
        <div className="border-t border-(--color-border) pt-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-(--color-text)">Tax-Advantaged Accounts</p>
              <p className="text-xs text-(--color-text-muted)">
                Realized gains/losses not reported on this return
              </p>
            </div>
            <button
              onClick={openDialog}
              className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-(--color-text-muted) ring-1 ring-(--color-border) hover:bg-(--color-bg-muted) hover:text-(--color-text)"
            >
              {hasData ? "Edit" : "Add"}
            </button>
          </div>

          {hasData ? (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11px] text-(--color-text-muted)">
                  <th className="pb-2 font-normal">Account</th>
                  <th className="pb-2 text-right font-normal">ST Net</th>
                  <th className="pb-2 text-right font-normal">LT Net</th>
                  <th className="pb-2 text-right font-normal">Total Net</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account, i) => {
                  const stNet = account.shortTermGains - account.shortTermLosses;
                  const ltNet = account.longTermGains - account.longTermLosses;
                  const total = stNet + ltNet;
                  return (
                    <tr key={i} className="border-t border-(--color-border)">
                      <td className="py-2 text-sm">{account.name}</td>
                      <td
                        className={`py-2 text-right text-sm slashed-zero tabular-nums ${stNet >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {stNet >= 0 ? "+" : ""}
                        {formatCurrency(stNet)}
                      </td>
                      <td
                        className={`py-2 text-right text-sm slashed-zero tabular-nums ${ltNet >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {ltNet >= 0 ? "+" : ""}
                        {formatCurrency(ltNet)}
                      </td>
                      <td
                        className={`py-2 text-right text-sm font-medium slashed-zero tabular-nums ${total >= 0 ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {total >= 0 ? "+" : ""}
                        {formatCurrency(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-(--color-text-muted)">No data added for {year}.</p>
          )}
        </div>
      </div>

      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`${year} Tax-Advantaged Accounts`}
        description="Enter realized gains and losses from Fidelity's Tax Center → Realized Gain/Loss."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {draft.map((account, i) => (
            <AccountEditor
              key={i}
              account={account}
              onChange={(updated) => updateAccount(i, updated)}
              onRemove={() => removeAccount(i)}
              showRemove={draft.length > 1}
            />
          ))}
          <button
            onClick={addAccount}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-(--color-border) py-3 text-xs text-(--color-text-muted) hover:border-(--color-text-muted) hover:text-(--color-text)"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add account
          </button>
        </div>
      </Dialog>
    </>
  );
}
