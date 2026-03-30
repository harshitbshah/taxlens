import appIconUrl from "../app-icon.png";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { FAQSection } from "./FAQSection";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  skipOpenAnimation?: boolean;
}

export function DemoDialog({ isOpen, onClose, skipOpenAnimation }: Props) {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title=""
      size="lg"
      fullScreenMobile
      autoFocusClose
      skipOpenAnimation={skipOpenAnimation}
      footer={<FAQSection />}
    >
      <div className="flex flex-col gap-6">
        {/* App icon + tagline */}
        <div className="flex flex-col items-center gap-4 text-center">
          <img src={appIconUrl} alt="TaxLens" width={80} height={80} className="rounded-2xl" />
          <div className="flex flex-col">
            <div className="text-center text-2xl font-semibold">TaxLens</div>
            <div className="text-center text-lg font-medium text-neutral-500 dark:text-neutral-400">
              Visualize and chat with your tax returns.
            </div>
          </div>
        </div>

        {/* Run from source */}
        <div className="space-y-4">
          <div className="rounded-lg bg-(--color-bg-muted) p-3 font-mono text-sm">
            <div className="text-(--color-text-muted)"># clone and run locally</div>
            <div>git clone https://github.com/harshitbshah/taxlens</div>
            <div>cd taxlens</div>
            <div>bun install</div>
            <div>bun run dev</div>
          </div>
          <p className="text-center text-xs text-(--color-text-muted)">
            Requires{" "}
            <a
              href="https://bun.sh"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-(--color-text)"
            >
              Bun
            </a>{" "}
            and an{" "}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-(--color-text)"
            >
              Anthropic API key
            </a>
          </p>
        </div>

        <Button
          nativeButton={false}
          render={
            <a
              href="https://github.com/harshitbshah/taxlens"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
          variant="secondary"
          className="justify-center text-center"
        >
          View on GitHub
        </Button>
      </div>
    </Dialog>
  );
}
