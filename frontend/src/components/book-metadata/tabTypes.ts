import type { useI18n } from "../../hooks/useI18n";
import type { useBookMetadata } from "../../hooks/book/useBookMetadata";
import type { useBookMetadataAi } from "../../hooks/book/useBookMetadataAi";

/** The `t` translate function returned by {@link useI18n}. */
export type TFunc = ReturnType<typeof useI18n>["t"];

/** Full state bundle from {@link useBookMetadata}. */
export type BookMetadataState = ReturnType<typeof useBookMetadata>;

/** Full state bundle from {@link useBookMetadataAi}. */
export type BookMetadataAiState = ReturnType<typeof useBookMetadataAi>;
