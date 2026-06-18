/**
 * module-git-sync — partial browser-side counterpart of `plugin-git-sync`.
 *
 * Offline parity layer (Maximal Offline, #34). The IMPORT half works in the
 * browser by talking to the GitHub REST API directly (list a repo's contents,
 * download files, route them through the client importer). Implementation lives
 * in `src/import/{githubImport,githubToken}.ts`; this barrel is the stable
 * plugin-parity seam under `modules/`.
 *
 * Partial parity: this needs live network connectivity (gated by
 * `FEATURES.GITHUB_IMPORT` → disabled when `navigator.onLine === false`). The
 * full write-book-template Git SYNC/PUSH path (a real `git` working copy with
 * commit/pull) is desktop-only and gated by `FEATURES.GIT_SYNC`.
 *
 * @example
 * import { parseGitHubUrl, runGitHubImport } from "@/modules/module-git-sync";
 */
export {
    parseGitHubUrl,
    listGitHubContents,
    downloadGitHubFile,
    runGitHubImport,
    GitHubImportError,
    GitHubNotFoundError,
    GitHubRateLimitError,
} from "../../import/githubImport";
export type {
    GitHubRepoRef,
    GitHubEntry,
    GitHubImportItemOutcome,
    GitHubImportSummary,
    RunGitHubImportOptions,
} from "../../import/githubImport";
export { getGitHubToken, setGitHubToken } from "../../import/githubToken";
