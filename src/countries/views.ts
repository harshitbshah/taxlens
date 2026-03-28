/**
 * Client-side country registry.
 * Import this only from src/App.tsx and React component files.
 *
 * To add a new country:
 *   1. Create src/countries/<code>/views.tsx  exporting a CountryClientPlugin
 *   2. Add one line below: import + register
 *   3. Create the matching server plugin in src/countries/<code>/index.ts
 *      and register it in src/countries/index.ts
 */
import type { CountryClientPlugin } from "../lib/country-registry";
import { indiaClientPlugin } from "./india/views";
import { usClientPlugin } from "./us/views";

export const CLIENT_REGISTRY: Record<string, CountryClientPlugin> = {
  [usClientPlugin.code]: usClientPlugin,
  [indiaClientPlugin.code]: indiaClientPlugin,
  // [canadaClientPlugin.code]: canadaClientPlugin,
};
