import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {ApiError, BookDetail, api} from "../api/client";
import ExportForm from "../components/ExportForm";
import {PageLayout} from "../components/PageLayout";
import {LoadingIndicator} from "../components/LoadingIndicator";
import {useGoBack} from "../hooks/useGoBack";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";

/**
 * Full-page export surface (Dialog->Pages migration C3). Replaces
 * ExportDialog: deep-linkable at `/books/:bookId/export`, Back returns to
 * the editor. The page fetches the book itself (deep-link = self-loading)
 * to supply the title + manual-TOC flag the dialog used to receive as
 * props; the format/options form lives in the shared ExportForm.
 */
export default function ExportPage() {
    const {t} = useI18n();
    const {bookId} = useParams<{bookId: string}>();
    const goBack = useGoBack(bookId ? `/book/${bookId}` : "/");
    const [book, setBook] = useState<BookDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!bookId) return;
        let cancelled = false;
        api.books
            .get(bookId)
            .then((data) => {
                if (!cancelled) setBook(data);
            })
            .catch((err) => {
                if (cancelled) return;
                notify.error(
                    err instanceof ApiError
                        ? err.detail
                        : t("ui.book_editor.load_error", "Buch konnte nicht geladen werden."),
                    err instanceof ApiError ? err : undefined,
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [bookId]);

    const title = book
        ? `${t("ui.export_dialog.title", "Export")}: ${book.title}`
        : t("ui.export_dialog.title", "Export");
    const hasManualToc = book
        ? book.chapters.some((ch) => ch.chapter_type === "toc")
        : false;

    return (
        <PageLayout
            title={title}
            testId="export-page"
            maxWidth="lg"
            onBack={goBack}
            backLabel={t("ui.common.back", "Zurück")}
        >
            {loading ? (
                <LoadingIndicator testId="export-page-loading" variant="block" />
            ) : book ? (
                <ExportForm
                    bookId={book.id}
                    bookTitle={book.title}
                    hasManualToc={hasManualToc}
                    onDone={goBack}
                />
            ) : (
                <p style={{color: "var(--text-muted)"}} data-testid="export-page-error">
                    {t("ui.book_editor.load_error", "Buch konnte nicht geladen werden.")}
                </p>
            )}
        </PageLayout>
    );
}
