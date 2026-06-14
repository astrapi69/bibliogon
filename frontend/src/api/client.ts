// api/client.ts - barrel for the typed API client (Batch 2 split).
//
// The implementation lives in sibling modules; this file re-exports the
// public surface so every `import { ... } from "../api/client"` call site
// (211 of them) keeps working unchanged:
//   - DTOs + formatVoiceLabel  -> ./types
//   - api object               -> ./apiObject (assembled from the entity modules)
//   - guardedFetch             -> ./http
//   - ApiError, SaveAbortedError -> ./errors
export * from "./types";
export { api } from "./apiObject";
export { guardedFetch } from "./http";
export { ApiError, SaveAbortedError } from "./errors";
