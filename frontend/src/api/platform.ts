/**
 * AI, KDP, promotion, settings, help, git, and system API namespaces.
 *
 * Part of the api/client.ts barrel split (Batch 2). Exposes the namespace
 * sub-object spread into the single `api` object in api/apiObject.ts.
 *
 * Issue #679 moves each namespace implementation into the api/platform/
 * subdirectory; this file is the composing barrel that re-assembles
 * `platformApi` with its original shape, so apiObject.ts (and every
 * `api.*` consumer) is unchanged.
 */
import { ai } from "./platform/ai";
import { kdp } from "./platform/kdp";
import { settings, i18n, editorPluginStatus } from "./platform/settings";
import { pluginInstall, licenses } from "./platform/plugins";
import { help, getStarted } from "./platform/help";
import { git, translations, gitSync, ssh } from "./platform/git";
import { promotion } from "./platform/promotion";
import { aplus } from "./platform/aplus";
import { system } from "./platform/system";

export type { KdpPackageFormat } from "./platform/kdp";
export type {
  PortfolioBoard,
  PortfolioBookRow,
  PortfolioFilters,
  PortfolioFormatEntry,
  PortfolioFormatStateUpdate,
} from "./platform/promotion";
export type {
  AplusDocumentRecord,
  AplusFinding,
  AplusImage,
  AplusMissingField,
  AplusMissingFields,
  AplusModule,
  AplusPackage,
} from "./platform/aplus";
export { APLUS_LANGUAGES, isAplusMissingFields } from "./platform/aplus";

export const platformApi = {
  ai,
  kdp,
  i18n,
  settings,
  editorPluginStatus,
  help,
  getStarted,
  pluginInstall,
  licenses,
  git,
  translations,
  gitSync,
  ssh,
  promotion,
  aplus,
  system,
};
