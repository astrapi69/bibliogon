import { type ComponentType, type Dispatch, type ReactElement, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";

import PageEditor from "../components/picture-book/PageEditor";
import ComicBookEditor from "../components/comics/ComicBookEditor";
import Storyboard from "../components/story-bible/Storyboard";
import BookMetadataEditor from "../components/book/BookMetadataEditor";
import { pageableBookTypeIds, useBookTypes } from "../hooks/book/useBookTypes";
import { getStorage } from "../storage";
import type { Book, BookDetail } from "../api/client";

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

interface PageBasedEditorParams {
    book: BookDetail;
    bookTypesSnapshot: ReturnType<typeof useBookTypes>;
    showStoryboard: boolean;
    showMetadata: boolean;
    allBooks: Book[];
    bookId: string | undefined;
    setBook: Dispatch<SetStateAction<BookDetail | null>>;
    navigate: NavigateFunction;
    setShowStoryboard: (value: boolean) => void;
    setShowMetadata: (value: boolean) => void;
}

/**
 * Render the page-based editor branch (picture_book / comic_book) for the
 * BookEditor page, or ``null`` when the book is a chapter-based (prose)
 * type so the caller falls through to the prose path.
 *
 * Extracted from BookEditor.tsx (god-file split, #207) as a pure
 * structural move. When ``?view=storyboard`` / ``?view=metadata`` are set
 * the matching surface replaces the editor — same URL-routed pattern as
 * the prose flow.
 *
 * @example
 * const pageEditor = renderPageBasedEditor({ book, ...rest });
 * if (pageEditor) return pageEditor;
 */
export function renderPageBasedEditor({
    book,
    bookTypesSnapshot,
    showStoryboard,
    showMetadata,
    allBooks,
    bookId,
    setBook,
    navigate,
    setShowStoryboard,
    setShowMetadata,
}: PageBasedEditorParams): ReactElement | null {
    if (!pageableBookTypeIds(bookTypesSnapshot).has(book.book_type)) return null;
    const editorName = bookTypesSnapshot.types[book.book_type]?.editor_component;
    const EditorComponent = editorName ? EDITOR_COMPONENTS[editorName] : undefined;
    if (!EditorComponent) return null;

    const storyboardSupported = STORYBOARD_BOOK_TYPES.has(book.book_type);
    if (showStoryboard && storyboardSupported) {
        return (
            <Storyboard
                bookId={book.id}
                bookTitle={book.title}
                onBack={() => setShowStoryboard(false)}
                onSelectPage={() => setShowStoryboard(false)}
            />
        );
    }
    if (showMetadata) {
        return (
            <BookMetadataEditor
                book={book}
                onSave={async (data) => {
                    const updated = await getStorage().books.update(book.id, data);
                    setBook((prev) => (prev ? ({ ...prev, ...updated } as BookDetail) : prev));
                }}
                onBack={() => setShowMetadata(false)}
                allBooks={allBooks}
                onRefresh={async () => {
                    if (!bookId) return;
                    const fresh = await getStorage().books.get(bookId);
                    setBook(fresh);
                }}
            />
        );
    }
    return (
        <EditorComponent
            bookId={book.id}
            bookTitle={book.title}
            onBack={() => navigate("/")}
            onShowMetadata={() => setShowMetadata(true)}
            onShowStoryboard={storyboardSupported ? () => setShowStoryboard(true) : undefined}
            onTitleSave={async (newTitle) => {
                const updated = await getStorage().books.update(book.id, {
                    title: newTitle,
                });
                setBook((prev) => (prev ? ({ ...prev, ...updated } as BookDetail) : prev));
            }}
            isPublished={book.status === "published" || book.status === "archived"}
        />
    );
}
