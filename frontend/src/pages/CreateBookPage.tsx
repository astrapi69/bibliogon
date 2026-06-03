import { useSearchParams, useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  BookCreate,
  BookFromTemplateCreate,
  BookType,
} from "../api/client";
import CreateBookForm from "../components/CreateBookForm";
import { PageLayout } from "../components/PageLayout";
import { pageableBookTypeIds, useBookTypes } from "../hooks/useBookTypes";
import { useGoBack } from "../hooks/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";

/** Book types the creation flow knows how to title. Anything else falls
 *  back to the generic "Neues Buch" title + the prose form. */
const KNOWN_BOOK_TYPES = new Set<BookType>([
  "prose",
  "picture_book",
  "comic_book",
]);

function parseBookType(raw: string | null): BookType {
  if (raw && KNOWN_BOOK_TYPES.has(raw as BookType)) return raw as BookType;
  return "prose";
}

/**
 * Full-page book-creation surface (Dialog->Pages migration C2). Replaces
 * the former CreateBookModal: deep-linkable at `/books/new?type=<id>`,
 * Back works, no overlay/size-jump. The form body lives in the shared
 * CreateBookForm; this page owns the route param, the per-type page
 * title, and the create+navigate handlers (moved here from Dashboard's
 * handleCreate/handleCreateFromTemplate).
 *
 * Navigation after create preserves the prior behavior:
 *   - page-based types (picture_book/comic_book) -> their editor, since
 *     the dashboard doesn't surface page content.
 *   - prose + template -> back to the dashboard with a `bookCreated`
 *     nav-state flag so the first-book donation onboarding still fires.
 */
export default function CreateBookPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = useGoBack("/");
  const bookTypesSnapshot = useBookTypes();
  const [searchParams] = useSearchParams();
  const bookType = parseBookType(searchParams.get("type"));

  const pageTitle =
    bookType === "picture_book"
      ? t("ui.create_book.title_picture_book", "Neues Bilderbuch")
      : bookType === "comic_book"
        ? t("ui.create_book.title_comic_book", "Neuer Comic")
        : t("ui.create_book.title", "Neues Buch");

  const goToBookOrDashboard = (bookId: string, createdType?: BookType) => {
    if (
      createdType !== undefined &&
      pageableBookTypeIds(bookTypesSnapshot).has(createdType)
    ) {
      navigate(`/book/${bookId}`);
    } else {
      // Prose: return to the dashboard so the new book shows in the
      // library; the nav-state flag re-triggers the first-book
      // donation-onboarding nudge (preserved from the old modal flow).
      navigate("/", { state: { bookCreated: true } });
    }
  };

  const handleCreate = async (data: BookCreate) => {
    try {
      const book = await api.books.create(data);
      goToBookOrDashboard(book.id, data.book_type as BookType | undefined);
    } catch (err) {
      notify.error(
        err instanceof ApiError
          ? err.detail
          : t("ui.create_book.create_error", "Buch konnte nicht erstellt werden."),
        err,
      );
    }
  };

  const handleCreateFromTemplate = async (data: BookFromTemplateCreate) => {
    try {
      // Templates are prose-only today; always return to the dashboard.
      await api.books.createFromTemplate(data);
      navigate("/", { state: { bookCreated: true } });
    } catch (err) {
      notify.error(
        err instanceof ApiError
          ? err.detail
          : t("ui.create_book.create_error", "Buch konnte nicht erstellt werden."),
        err,
      );
    }
  };

  return (
    <PageLayout
      title={pageTitle}
      titleTestId={`create-book-title-${bookType}`}
      testId="create-book-page"
      maxWidth="md"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      <CreateBookForm
        bookType={bookType}
        onCreate={handleCreate}
        onCreateFromTemplate={handleCreateFromTemplate}
        onCancel={goBack}
      />
    </PageLayout>
  );
}
