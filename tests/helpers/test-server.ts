import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

import { createServer, type CreateServerOptions } from "../../src/server";

export type TestServer = {
  url: string;
  dataDir: string;
  stop: () => Promise<void>;
};

// Port 0 lets the OS pick a free port so test files can run servers in parallel.
// Each server gets its own data dir on top of the HM-2 run-wide isolation, so assertions
// about files on disk only ever see what this test wrote.
export async function startTestServer(
  options: Partial<Omit<CreateServerOptions, "port">> = {},
): Promise<TestServer> {
  const dataDir = await mkdtemp(path.join(tmpdir(), "taxlens-server-"));
  const previousDataDir = process.env.TAX_UI_DATA_DIR;
  process.env.TAX_UI_DATA_DIR = dataDir;

  const server = createServer({ port: 0, hostname: "127.0.0.1", ...options });

  return {
    url: server.url.toString().replace(/\/$/, ""),
    dataDir,
    stop: async () => {
      await server.stop(true);
      process.env.TAX_UI_DATA_DIR = previousDataDir;
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
