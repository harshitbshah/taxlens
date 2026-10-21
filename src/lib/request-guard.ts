// HM-8: browsers attach cached Basic-Auth credentials (and reach localhost) on requests that
// another site triggers, e.g. an auto-submitting form POST to /api/clear-data. Browsers label
// such requests; tools like curl send neither header and are allowed.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isCrossSiteWrite(req: Request): boolean {
  if (SAFE_METHODS.has(req.method)) return false;

  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") return true;

  const origin = req.headers.get("origin");
  if (origin === null) return false;
  // An unparseable Origin (including the literal "null") is never same-origin; compare
  // explicitly so a missing Host header can't make null === null pass.
  const host = originHost(origin);
  return host === null || host !== req.headers.get("host");
}

// Compares host:port, not just hostname. Relies on the reverse proxy preserving the client's
// Host header (Caddy's default) — see docs/HOSTING.md.
function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}
