// Server-only: Bun file I/O. Do not import this module in browser code.
// For shared types and utilities, import from ./forecast-profile-schema instead.

export type { ForecastProfile } from "./forecast-profile-schema";
export {
  confidenceLevel,
  countFilledFields,
  TOTAL_PROFILE_FIELDS,
} from "./forecast-profile-schema";
import { dataPath } from "./data-dir";
import type { ForecastProfile } from "./forecast-profile-schema";

const PROFILE_FILE = () => dataPath(".forecast-profile.json");

async function readProfiles(): Promise<Record<string, ForecastProfile>> {
  const file = Bun.file(PROFILE_FILE());
  if (!(await file.exists())) return {};
  try {
    const raw = (await file.json()) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return {};
    return raw as Record<string, ForecastProfile>;
  } catch {
    return {};
  }
}

export async function getForecastProfile(country: string): Promise<ForecastProfile | null> {
  const profiles = await readProfiles();
  return profiles[country] ?? null;
}

export async function saveForecastProfile(
  country: string,
  profile: ForecastProfile,
): Promise<void> {
  const profiles = await readProfiles();
  profiles[country] = profile;
  await Bun.write(PROFILE_FILE(), JSON.stringify(profiles, null, 2));
}
