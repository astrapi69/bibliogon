import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../../hooks/useI18n";

const AUTO_REDIRECT_SECONDS = 5;

export function SuccessStep({
    bookId,
    title,
    onClose,
    onAnother,
}: {
    bookId: string;
    title: string;
    onClose: () => void;
    onAnother: () => void;
}) {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [remaining, setRemaining] = useState(AUTO_REDIRECT_SECONDS);
    const timer = useRef<number | null>(null);
    const paused = useRef(false);

    useEffect(() => {
        const tick = () => {
            if (paused.current) return;
            setRemaining((prev) => {
                if (prev <= 1) {
                    onClose();
                    // Articles-only restores have no bookId; route the
                    // user to /articles instead of /book/ which would
                    // 404. The articles dashboard is where the freshly
                    // restored rows appear.
                    navigate(bookId ? `/book/${bookId}` : "/articles");
                    return 0;
                }
                return prev - 1;
            });
        };
        timer.current = window.setInterval(tick, 1000);
        return () => {
            if (timer.current !== null) window.clearInterval(timer.current);
        };
    }, [bookId, navigate, onClose]);

    const cancelAutoRedirect = () => {
        paused.current = true;
        if (timer.current !== null) {
            window.clearInterval(timer.current);
            timer.current = null;
        }
    };

    return (
        <div
            data-testid="success-step"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                padding: "32px 0",
            }}
        >
            <CheckCircle size={48} style={{ color: "var(--accent)" }} />
            <h3 style={{ margin: 0 }}>
                {t("ui.import_wizard.success_title", "Import complete")}
            </h3>
            <p
                data-testid="success-book-title"
                style={{
                    margin: 0,
                    fontSize: "0.9375rem",
                    color: "var(--text-secondary)",
                    textAlign: "center",
                }}
            >
                {t("ui.import_wizard.success_book_title", "Imported as: {title}").replace(
                    "{title}",
                    title,
                )}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                    className="btn btn-primary"
                    data-testid="success-open-editor"
                    onClick={() => {
                        cancelAutoRedirect();
                        onClose();
                        navigate(`/book/${bookId}`);
                    }}
                >
                    {t("ui.import_wizard.success_open_editor", "Open in editor")}
                </button>
                <button
                    className="btn btn-secondary"
                    data-testid="success-import-another"
                    onClick={() => {
                        cancelAutoRedirect();
                        onAnother();
                    }}
                >
                    {t(
                        "ui.import_wizard.success_import_another",
                        "Import another",
                    )}
                </button>
            </div>
            {remaining > 0 && (
                <p
                    data-testid="success-auto-redirect"
                    style={{
                        margin: "8px 0 0 0",
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                    }}
                >
                    {t(
                        "ui.import_wizard.success_auto_redirect",
                        "Opening editor in {n}s...",
                    ).replace("{n}", String(remaining))}
                </p>
            )}
        </div>
    );
}
