import { argv } from "bun";

import { createServer } from "./server";

// Parse --port from command line args (supports --port=XXXX or --port XXXX)
function parsePort(): number {
  const idx = argv.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
  if (idx === -1) return 3000;
  const arg = argv[idx]!;
  if (arg.startsWith("--port=")) return Number(arg.split("=")[1]);
  return Number(argv[idx + 1]) || 3000;
}

const server = createServer({
  port: parsePort(),
  production: process.env.NODE_ENV === "production",
  staticDir: process.env.TAX_UI_STATIC_DIR || import.meta.dir,
});

console.log(`Server running at ${server.url}`);
