/**
 * Server-side country registry.
 * Import this only from src/index.ts and server-side lib files.
 *
 * To add a new country:
 *   1. Create src/countries/<code>/index.ts  exporting a CountryServerPlugin
 *   2. Add one line below: import + register
 *   3. Create the matching client plugin in src/countries/<code>/views.tsx
 *      and register it in src/countries/views.ts
 */
import type { CountryServerPlugin } from "../lib/country-registry";
import { indiaServerPlugin } from "./india/index";
import { usServerPlugin } from "./us/index";

export const SERVER_REGISTRY: Record<string, CountryServerPlugin> = {
  [usServerPlugin.code]: usServerPlugin,
  [indiaServerPlugin.code]: indiaServerPlugin,
  // [canadaServerPlugin.code]: canadaServerPlugin,
};

/** Convenience: ordered list of registered country codes. */
export const REGISTERED_COUNTRIES = Object.keys(SERVER_REGISTRY);
