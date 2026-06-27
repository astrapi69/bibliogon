import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  api,
  ApiError,
  BookCreate,
  BookFromTemplateCreate,
  BookType,
} from "../api/client";
import { getStorage } from "../storage";
import {
  findClientTemplate,
  instantiateClientBookTemplate,
  isClientTemplateId,
} from "../data/bookTemplates";
import CreateBookForm from "../components/book/CreateBookForm";
import { PageLayout } from "../components/shared/PageLayout";
import { pageableBookTypeIds, useBookTypes } from "../hooks/book/useBookTypes";
import { useGoBack } from "../hooks/navigation/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/platform/notify";

/** Book types the creation flow knows how to title. Anything else falls
 *  back to the configured default (ui.defaults.book_type) or prose. */
const KNOWN_BOOK_TYPES = new Set<BookType>([
  "prose",
  "picture_book",
  "comic_book",
]);

function isKnownBookType(raw: string | null): raw is BookType {
  return !!raw && KNOWN_BOOK_TYPES.has(raw as BookType);
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

  // A valid ?type= is an EXPLICIT choice (the dashboard dropdown
  // deep-links with it) and always overrides the configured default.
  const requestedType = searchParams.get("type");
  const requestedValid = isKnownBookType(requestedType);

  // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: when no explicit ?type=
  // is present, the page pre-selects the configured workspace default
  // (ui.defaults.book_type). It is fetched async; until it resolves we
  // gate the form so the user never sees the wrong (prose) form shape
  // flash before switching.
  const [configuredDefault, setConfiguredDefault] = useState<BookType | null>(
    null,
  );
  const [defaultResolved, setDefaultResolved] = useState(false);

  useEffect(() => {
    if (requestedValid) return; // explicit type wins; no fetch needed
    let cancelled = false;
    getStorage()
      .settings.getApp()
      .then((config) => {
        if (cancelled) return;
        const uiConfig = (config.ui || {}) as Record<string, unknown>;
        const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
        const dt = uiDefaults.book_type;
        if (typeof dt === "string" && isKnownBookType(dt)) {
          setConfiguredDefault(dt);
        }
        setDefaultResolved(true);
      })
      .catch(() => {
        if (!cancelled) setDefaultResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedValid]);

  const bookType: BookType = requestedValid
    ? (requestedType as BookType)
    : (configuredDefault ?? "prose");

  const pageTitle =
    bookType === "picture_book"
      ? t("ui.create_book.title_picture_book", "Neues Bilderbuch")
      : bookType === "comic_book"
        ? t("ui.create_book.title_comic_book", "Neues Comicbuch")
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
      const book = await getStorage().books.create(data);
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
      // Offline (Dexie) client-side built-in templates: instantiate the book +
      // its chapters/pages straight through the storage seam (zero /api). Page-
      // based types (Kinderbuch/Comic) land in their editor; prose returns to
      // the dashboard — handled by goToBookOrDashboard.
      if (isClientTemplateId(data.template_id)) {
        const template = findClientTemplate(data.template_id);
        if (!template) {
          throw new Error(`Unknown client template: ${data.template_id}`);
        }
        const book = await instantiateClientBookTemplate(
          getStorage(),
          template,
          data,
          t,
        );
        goToBookOrDashboard(book.id, template.bookType);
        return;
      }
      // Online backend templates are prose-only; always return to the dashboard.
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

  // Gate the form until the configured default resolves (only when no
  // explicit ?type= was given). Avoids a prose-form flash before the
  // configured default (e.g. comic_book) is applied.
  if (!requestedValid && !defaultResolved) {
    return (
      <PageLayout
        title={t("ui.create_book.title", "Neues Buch")}
        testId="create-book-page"
        maxWidth="md"
        onBack={goBack}
        backLabel={t("ui.common.back", "Zurück")}
      >
        <p data-testid="create-book-loading">{t("ui.common.loading", "Lädt…")}</p>
      </PageLayout>
    );
  }

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
