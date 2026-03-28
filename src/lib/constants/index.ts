// Country constants registry.
//
// Each country has its own module with its own YearConstants type,
// data record, getter, and prompt formatter. No shared supertype is forced
// across countries — tax structures differ too much to generalise usefully.
//
// To add a new country: see docs/ADDING_COUNTRY_CONSTANTS.md
//
// Registered countries:
export {
  formatIndiaConstantsForPrompt,
  getIndiaConstants,
  type IndiaRegimeConstants,
  type IndiaYearConstants,
} from "./india";
export {
  type BracketEntry,
  formatUsConstantsForPrompt,
  getUsConstants,
  type UsYearConstants,
} from "./us";

// Planned — uncomment and create the module when ready:
// export { getCanadaConstants, formatCanadaConstantsForPrompt, type CanadaYearConstants } from "./canada";
