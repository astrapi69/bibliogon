/**
 * Placeholder editor for ``book_type === "comic_book"`` books.
 *
 * Session 1 (plugin-comics scaffolding): renders a minimal page
 * showing the book title, a back button, and the plugin's
 * ``/api/comics/info`` response so the user can verify the plugin
 * is mounted. The placeholder is INTENTIONAL — Session 2 ships the
 * full panel + multi-bubble editor and replaces this component.
 *
 * This is NOT a half-wired feature per the lessons-learned rule.
 * The "Half-wired feature lifecycle" pattern fires when a state-
 * write surface exists without its consumer. Here the user creates
 * a comic_book via the Dashboard chevron menu and lands on a page
 * that LOUDLY tells them Session 2 is pending. The contract the
 * UI promises (a comic-authoring editor) is openly deferred, not
 * silently broken.
 */

import {useEffect, useState} from "react";
import {api, ApiError, type ComicsPluginInfo} from "../api/client";
import {useI18n} from "../hooks/useI18n";

interface Props {
    bookId: string;
    bookTitle: string;
    onBack: () => void;
}

export default function ComicBookEditor({bookId, bookTitle, onBack}: Props) {
    const {t} = useI18n();
    const [pluginInfo, setPluginInfo] = useState<ComicsPluginInfo | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.comics
            .getInfo()
            .then((info) => {
                if (!cancelled) setPluginInfo(info);
            })
            .catch((err) => {
                if (cancelled) return;
                const detail =
                    err instanceof ApiError ? err.detail : String(err);
                setError(detail);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div
            data-testid="comic-book-editor-root"
            data-book-id={bookId}
            style={{
                maxWidth: 720,
                margin: "0 auto",
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: 16,
            }}
        >
            <header style={{display: "flex", alignItems: "center", gap: 12}}>
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="comic-book-editor-back"
                    onClick={onBack}
                >
                    {t("ui.comic_book_editor.back", "Zurück")}
                </button>
                <h1
                    data-testid="comic-book-editor-title"
                    style={{margin: 0, fontSize: "1.4rem"}}
                >
                    {bookTitle}
                </h1>
            </header>

            <section
                data-testid="comic-book-editor-placeholder"
                style={{
                    padding: 20,
                    border: "1px solid var(--border, #ddd)",
                    borderRadius: 8,
                    backgroundColor: "var(--surface-2, #fafafa)",
                }}
            >
                <h2 style={{marginTop: 0}}>
                    {t(
                        "ui.comic_book_editor.placeholder_title",
                        "Comic-Editor in Vorbereitung",
                    )}
                </h2>
                <p>
                    {t(
                        "ui.comic_book_editor.placeholder_message",
                        "Das Comic-Plugin ist installiert. Der vollständige Editor mit Panels und Sprechblasen kommt in Session 2.",
                    )}
                </p>

                {pluginInfo && (
                    <dl
                        data-testid="comic-book-editor-plugin-info"
                        style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            gap: "4px 12px",
                            fontSize: "0.9rem",
                            marginTop: 16,
                        }}
                    >
                        <dt>
                            <strong>
                                {t(
                                    "ui.comic_book_editor.plugin_label",
                                    "Plugin",
                                )}
                            </strong>
                        </dt>
                        <dd
                            data-testid="comic-book-editor-plugin-name"
                            style={{margin: 0}}
                        >
                            {pluginInfo.name} v{pluginInfo.version}
                        </dd>
                        <dt>
                            <strong>
                                {t(
                                    "ui.comic_book_editor.session_label",
                                    "Session",
                                )}
                            </strong>
                        </dt>
                        <dd
                            data-testid="comic-book-editor-plugin-session"
                            style={{margin: 0}}
                        >
                            {pluginInfo.session} ({pluginInfo.status})
                        </dd>
                    </dl>
                )}

                {error && (
                    <p
                        data-testid="comic-book-editor-plugin-error"
                        role="alert"
                        style={{color: "var(--danger, #c00)", marginTop: 16}}
                    >
                        {t(
                            "ui.comic_book_editor.plugin_unreachable",
                            "Das Comic-Plugin ist nicht erreichbar:",
                        )}{" "}
                        {error}
                    </p>
                )}
            </section>
        </div>
    );
}
