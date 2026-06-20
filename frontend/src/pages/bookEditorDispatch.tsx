import { type ComponentType } from "react";

import PageEditor from "../components/picture-book/PageEditor";
import ComicBookEditor from "../components/comics/ComicBookEditor";

/**
 * Editor dispatch table for page-based book types (BOOK-TYPES-SSOT-YAML-01 C6).
 *
 * The BookTypeRegistry's ``editor_component`` field is a string name; this map
 * resolves it to the actual React component at render time. Adding a new
 * page-based book type with a different editor = add the component import + one
 * entry here. New chapter-based types fall through to the prose path
 * automatically. Extracted from BookEditor for the cohesion file-size gate
 * (issue #330).
 */
export const EDITOR_COMPONENTS: Record<
    string,
    ComponentType<{
        bookId: string;
        bookTitle: string;
        onBack: () => void;
        onShowMetadata: () => void;
        /** Optional storyboard entry-point. Wired for both picture_book
         *  (PageEditor) and comic_book (ComicBookEditor) per
         *  STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1; gated by
         *  {@link STORYBOARD_BOOK_TYPES}. */
        onShowStoryboard?: () => void;
        onTitleSave?: (title: string) => void | Promise<void>;
        isPublished?: boolean;
    }>
> = {
    PageEditor,
    ComicBookEditor,
};

/**
 * Per-editor allow-list for the Storyboard view. Mirrors the
 * ``content_model: pages`` gate. Originally picture_book-only per A4 of the
 * PICTURE-BOOK-STORYBOARD-VIEW-01 Pre-Inspection;
 * STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1 extends it to comic_book —
 * the Storyboard annotation columns (notes, story_beat, mood_color, act_group)
 * exist on ALL Page records, and StoryboardCard renders comic pages via the
 * layout-tag path (no panel thumbnail yet; a richer panel-thumbnail render is a
 * tracked follow-up).
 */
export const STORYBOARD_BOOK_TYPES = new Set<string>(["picture_book", "comic_book"]);
