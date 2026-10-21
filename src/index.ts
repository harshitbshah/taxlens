import { argv } from "bun";

import { resolveServerEnv } from "./lib/hosted-config";
import { createServer } from "./server";

// Parse --port from command line args (supports --port=XXXX or --port XXXX)
function parsePort(): number {
  const idx = argv.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
  if (idx === -1) return 3000;
  const arg = argv[idx]!;
  if (arg.startsWith("--port=")) return Number(arg.split("=")[1]);
  return Number(argv[idx + 1]) || 3000;
}

const resolved = resolveServerEnv(process.env, {
  cwd: process.cwd(),
  defaultStaticDir: import.meta.dir,
});

if (!resolved.ok) {
  console.error("TaxLens refused to start — invalid configuration:");
  for (const error of resolved.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const { config } = resolved;
const server = createServer({
  port: parsePort(),
  hostname: config.hostname,
  production: config.production,
  staticDir: config.staticDir,
});

console.log(`Server running at ${server.url}${config.hosted ? " (hosted mode)" : ""}`);
