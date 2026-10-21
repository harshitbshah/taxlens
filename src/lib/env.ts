const DEV_DEMO_OVERRIDE_KEY = "dev-demo-override";

export function getDevDemoOverride(): boolean | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(DEV_DEMO_OVERRIDE_KEY);
  return stored === null ? null : stored === "true";
}

export function setDevDemoOverride(value: boolean | null): void {
  if (typeof window === "undefined") return;
  if (value === null) {
    localStorage.removeItem(DEV_DEMO_OVERRIDE_KEY);
  } else {
    localStorage.setItem(DEV_DEMO_OVERRIDE_KEY, String(value));
  }
}

// HM-6: the server is the only authority on demo mode. Hostname sniffing (upstream's public
// demo site) made every self-hosted deployment show sample data instead of the user's returns.
export function resolveDemoMode(override: boolean | null, serverIsDemo: boolean): boolean {
  return override ?? serverIsDemo;
}
