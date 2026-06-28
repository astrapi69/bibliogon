/**
 * Static, untranslated content for the Settings > About sub-sections:
 * the toolchain tag list and the author / license / resource URLs.
 * Extracted from AboutSettings.tsx (#675).
 */

/** The toolchain Bibliogon is built with. Each tag links to the
 *  project's home; the labels are project names and stay English
 *  (untranslated) per issue #87. */
export const BUILT_WITH: ReadonlyArray<{ label: string; url: string }> = [
  { label: "React", url: "https://react.dev" },
  { label: "FastAPI", url: "https://fastapi.tiangolo.com" },
  { label: "PluginForge", url: "https://github.com/astrapi69/pluginforge" },
  { label: "TipTap", url: "https://tiptap.dev" },
  { label: "Dexie", url: "https://dexie.org" },
  { label: "Tailwind", url: "https://tailwindcss.com" },
  { label: "SQLAlchemy", url: "https://www.sqlalchemy.org" },
  { label: "Pydantic", url: "https://docs.pydantic.dev" },
  { label: "Vite", url: "https://vite.dev" },
  { label: "TypeScript", url: "https://www.typescriptlang.org" },
  { label: "Playwright", url: "https://playwright.dev" },
];

export const AUTHOR_NAME = "Asterios Raptis";
export const AUTHOR_URL = "https://github.com/astrapi69";
export const LICENSE_URL =
  "https://github.com/astrapi69/bibliogon/blob/main/LICENSE";
export const REPOSITORY_URL = "https://github.com/astrapi69/bibliogon";
export const DOCS_URL = "https://astrapi69.github.io/bibliogon/docs/";
export const ISSUES_URL = "https://github.com/astrapi69/bibliogon/issues";
