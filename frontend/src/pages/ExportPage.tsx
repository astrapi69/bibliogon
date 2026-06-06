import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {ApiError, BookDetail, api} from "../api/client";
import ClientExportMenu from "../components/ClientExportMenu";
import ExportForm from "../components/ExportForm";
import {PageLayout} from "../components/PageLayout";
import {LoadingIndicator} from "../components/LoadingIndicator";
import {buildBookDocument} from "../export";
import {getStorage} from "../storage";
import {useGoBack} from "../hooks/useGoBack";
import {useI18n} from "../hooks/useI18n";
import {useOfflineFeatureGate} from "../storage/useOfflineFeatureGate";
import {notify} from "../utils/notify";

/**
 * Full-page export surface (Dialog->Pages migration C3). Replaces
 * ExportDialog: deep-linkable at `/books/:bookId/export`, Back returns to
 * the editor.
 *
 * Two-engine export (Maximal-Offline P2): online uses the Pandoc-backed
 * ExportForm (PDF via LaTeX etc.); offline, where there is no backend, the
 * book is loaded from Dexie (with chapter content) and rendered fully in the
 * browser via the client-side export engine (Markdown/HTML/Text/PDF/EPUB/DOCX).
 */
export default function ExportPage() {
    const {t} = useI18n();
    const {offline} = useOfflineFeatureGate();
    const {bookId} = useParams<{bookId: string}>();
    const goBack = useGoBack(bookId ? `/book/${bookId}` : "/");
    const [book, setBook] = useState<BookDetail | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!bookId) return;
        let cancelled = false;
        // Offline needs the chapter CONTENT for client-side rendering; online
        // the Pandoc form only needs the title + manual-TOC flag.
        const loader = offline
            ? getStorage().books.get(bookId, true)
            : api.books.get(bookId);
        loader
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
    }, [bookId, offline]);

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
            ) : !book ? (
                <p style={{color: "var(--text-muted)"}} data-testid="export-page-error">
                    {t("ui.book_editor.load_error", "Buch konnte nicht geladen werden.")}
                </p>
            ) : offline ? (
                <div
                    data-testid="export-page-client"
                    style={{display: "flex", flexDirection: "column", gap: 12}}
                >
                    <p style={{color: "var(--text-muted)", margin: 0}}>
                        {t(
                            "ui.export.client_hint",
                            "Offline-Export direkt im Browser. Für Pandoc-PDF (LaTeX) die Desktop-App nutzen.",
                        )}
                    </p>
                    <ClientExportMenu
                        getDocument={() => buildBookDocument(book, book.chapters)}
                        testId="export-page-client-trigger"
                    />
                </div>
            ) : (
                <ExportForm
                    bookId={book.id}
                    bookTitle={book.title}
                    hasManualToc={hasManualToc}
                    onDone={goBack}
                />
            )}
        </PageLayout>
    );
}
