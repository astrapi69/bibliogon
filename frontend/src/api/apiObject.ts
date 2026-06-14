import { booksApi } from "./books";
import { articlesApi } from "./articles";
import { chaptersApi } from "./chapters";
import { mediaApi } from "./media";
import { platformApi } from "./platform";

/**
 * The single typed API client surface. Assembled by spreading the
 * domain-grouped namespace objects (Batch 2 god-file split). client.ts
 * re-exports this as `api` so every `import { api } from "../api/client"`
 * call site stays unchanged.
 */
export const api = {
  ...booksApi,
  ...articlesApi,
  ...chaptersApi,
  ...mediaApi,
  ...platformApi,
};
