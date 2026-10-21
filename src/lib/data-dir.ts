import path from "path";

// HM-1: resolved on every call, never cached. Capturing this at module load let tests (and
// any code that sets TAX_UI_DATA_DIR after import) silently use the wrong directory.
export function getDataDir(): string {
  return process.env.TAX_UI_DATA_DIR || process.cwd();
}

export function dataPath(file: string): string {
  return path.join(getDataDir(), file);
}
