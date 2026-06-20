import { useState, useEffect, useCallback } from "react";
import {
    api,
    ApiError,
    AudiobookChapterFile,
    BookAudiobook,
    Chapter,
} from "../../api/client";
import {
    Download,
    Trash2,
    Package,
    Clock,
    AlertCircle,
    Play,
    Pause,
} from "lucide-react";
import { notify } from "../../utils/platform/notify";
import { useI18n } from "../../hooks/useI18n";
import { LoadingIndicator } from "../LoadingIndicator";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useDialog } from "../shared/AppDialog";
import AudiobookPlayer, { PlayerChapter } from "../book/AudiobookPlayer";
import { slugify } from "../../shared/utils/slugify";
import styles from "../BookMetadataEditor.module.css";

function formatDuration(seconds: number | null | undefined): string {
    if (seconds == null || seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AudiobookDownloads({
    bookId,
    bookTitle,
    bookChapters,
}: {
    bookId: string;
    bookTitle: string;
    bookChapters: Chapter[];
}) {
    const { t } = useI18n();
    const bookSlug = slugify(bookTitle) || "audiobook";
    const dialog = useDialog();
    const [data, setData] = useState<BookAudiobook | null>(null);
    const [previews, setPreviews] = useState<
        { filename: string; size_bytes: number; url: string }[]
    >([]);
    const [busy, setBusy] = useState(false);
    const [subTab, setSubTab] = useState<"downloads" | "previews">("downloads");
    const [playingIndex, setPlayingIndex] = useState<number | null>(null);

    const load = useCallback(async () => {
        try {
            const result = await api.bookAudiobook.get(bookId);
            setData(result);
        } catch (err) {
            if (!(err instanceof ApiError) || err.status !== 404) {
                console.error("Failed to load audiobook metadata:", err);
            }
            setData({ exists: false, book_id: bookId });
        }
        try {
            const p = await api.bookAudiobook.listPreviews(bookId);
            setPreviews(p);
        } catch {
            setPreviews([]);
        }
    }, [bookId]);

    useEffect(() => {
        load();
    }, [load]);

    // Live-update the audiobook metadata view as chapters are generated.
    // The backend broadcasts events to audiobook:{bookId} via WebSocket
    // after each flush_chapter, finalize, and mark_failed call.
    useWebSocket<{ event: string }>(
        `audiobook:${bookId}`,
        useCallback(() => {
            load();
        }, [load]),
    );

    const handleDelete = async () => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete", "Audiobook löschen"),
            t(
                "ui.audiobook.delete_confirm",
                "Audiobook wirklich löschen? Die Dateien sind danach weg.",
            ),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.delete(bookId);
            notify.success(t("ui.audiobook.deleted", "Audiobook gelöscht"));
            await load();
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeleteChapter = async (filename: string) => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_file", "Datei löschen"),
            t("ui.audiobook.delete_file_confirm", "Diese Datei wirklich löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deleteChapter(bookId, filename);
            await load();
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeletePreview = async (filename: string) => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_file", "Datei löschen"),
            t("ui.audiobook.delete_file_confirm", "Diese Datei wirklich löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deletePreview(bookId, filename);
            setPreviews((prev) => prev.filter((p) => p.filename !== filename));
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const handleDeleteAllPreviews = async () => {
        const confirmed = await dialog.confirm(
            t("ui.audiobook.delete_previews", "Alle Previews löschen"),
            t("ui.audiobook.delete_previews_confirm", "Alle Vorhoer-Dateien löschen?"),
            "danger",
        );
        if (!confirmed) return;
        setBusy(true);
        try {
            await api.bookAudiobook.deleteAllPreviews(bookId);
            setPreviews([]);
        } catch (err) {
            notify.error(t("ui.audiobook.delete_failed", "Löschen fehlgeschlagen"), err);
        }
        setBusy(false);
    };

    const formatBytes = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    };

    const hasDownloads = data?.exists;
    const hasPreviews = previews.length > 0;

    if (!data) {
        return (
            <div className={styles.audiobookSection}>
                <LoadingIndicator
                    testId="audiobook-loading"
                    label={t("ui.common.loading", "Laden...")}
                />
            </div>
        );
    }

    return (
        <div className={styles.audiobookSection}>
            {/* Sub-tab selector */}
            <div
                style={{
                    display: "flex",
                    gap: 0,
                    marginBottom: 12,
                    borderBottom: "1px solid var(--border)",
                }}
            >
                <button
                    onClick={() => setSubTab("downloads")}
                    style={{
                        padding: "6px 14px",
                        border: "none",
                        cursor: "pointer",
                        background: "none",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        color: subTab === "downloads" ? "var(--accent)" : "var(--text-muted)",
                        borderBottom:
                            subTab === "downloads"
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                        fontFamily: "var(--font-body)",
                    }}
                >
                    {t("ui.audiobook.downloads_title", "Verfügbare Downloads")}
                    {hasDownloads && data.chapters && ` (${data.chapters.length})`}
                </button>
                <button
                    onClick={() => setSubTab("previews")}
                    style={{
                        padding: "6px 14px",
                        border: "none",
                        cursor: "pointer",
                        background: "none",
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        color: subTab === "previews" ? "var(--accent)" : "var(--text-muted)",
                        borderBottom:
                            subTab === "previews"
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                        fontFamily: "var(--font-body)",
                    }}
                >
                    Previews{hasPreviews && ` (${previews.length})`}
                </button>
            </div>

            {/* Downloads sub-tab */}
            {subTab === "downloads" && (
                <>
                    {(() => {
                        // Build a lookup from book-chapter title to generated audio file
                        const audioByTitle = new Map<string, AudiobookChapterFile>();
                        for (const ch of data.chapters || []) {
                            if (ch.title) audioByTitle.set(ch.title, ch);
                        }
                        const isPartial = data.status === "in_progress";
                        const sortedChapters = [...bookChapters].sort(
                            (a, b) => a.position - b.position,
                        );

                        return (
                            <>
                                {/* Engine / voice / speed summary line */}
                                {hasDownloads && (
                                    <>
                                        <div className={styles.audiobookMetaLine}>
                                            {data.created_at && (
                                                <span>
                                                    {t("ui.audiobook.created_at", "Erstellt am")}:{" "}
                                                    {new Date(data.created_at).toLocaleString()}
                                                </span>
                                            )}
                                            {data.engine && (
                                                <span style={{ marginLeft: 12 }}>
                                                    Engine: {data.engine}
                                                </span>
                                            )}
                                            {data.voice && (
                                                <span style={{ marginLeft: 12 }}>
                                                    {t("ui.audiobook.voice", "Stimme")}:{" "}
                                                    {data.voice}
                                                </span>
                                            )}
                                            {data.speed && (
                                                <span style={{ marginLeft: 12 }}>
                                                    {data.speed}x
                                                </span>
                                            )}
                                        </div>
                                        {isPartial && (
                                            <div
                                                style={{
                                                    marginTop: 8,
                                                    fontSize: "0.75rem",
                                                    color: "var(--warning, #e67e22)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 6,
                                                }}
                                            >
                                                <AlertCircle size={14} />
                                                {t(
                                                    "ui.audiobook.status_partial",
                                                    "Export unvollständig. Einige Kapitel wurden noch nicht generiert.",
                                                )}
                                            </div>
                                        )}
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 8,
                                                marginTop: 12,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            {data.merged && (
                                                <a
                                                    className="btn btn-primary btn-sm"
                                                    href={api.bookAudiobook.mergedUrl(bookId)}
                                                    download={`${bookSlug}.mp3`}
                                                    data-testid="audiobook-download-merged"
                                                >
                                                    <Download size={12} />{" "}
                                                    {t(
                                                        "ui.audiobook.download_merged",
                                                        "Gemergtes Audiobook",
                                                    )}
                                                    {data.merged.duration_seconds
                                                        ? ` (${formatDuration(data.merged.duration_seconds)})`
                                                        : ` (${formatBytes(data.merged.size_bytes)})`}
                                                </a>
                                            )}
                                            {data.chapters && data.chapters.length > 0 && (
                                                <a
                                                    className="btn btn-secondary btn-sm"
                                                    href={api.bookAudiobook.zipUrl(bookId)}
                                                    download={`${bookSlug}.zip`}
                                                    data-testid="audiobook-download-zip"
                                                >
                                                    <Package size={12} />{" "}
                                                    {t("ui.audiobook.download_zip", "ZIP")}
                                                </a>
                                            )}
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                onClick={handleDelete}
                                                disabled={busy}
                                                style={{ color: "var(--danger, #c0392b)" }}
                                            >
                                                <Trash2 size={12} />{" "}
                                                {t("ui.audiobook.delete", "Audiobook löschen")}
                                            </button>
                                        </div>
                                    </>
                                )}
                                {!hasDownloads && sortedChapters.length === 0 && (
                                    <div className={styles.audiobookMuted}>
                                        {t(
                                            "ui.audiobook.downloads_empty",
                                            "Noch kein Audiobook generiert. Nutze den Export-Dialog um eines zu erstellen.",
                                        )}
                                    </div>
                                )}

                                {/* Per-chapter audio status list */}
                                {(() => {
                                    // Build the player chapter list: only chapters with audio, in order
                                    const playerChapters: PlayerChapter[] = [];
                                    const chapterToPlayerIndex = new Map<string, number>();
                                    for (const bookCh of sortedChapters) {
                                        const audio = audioByTitle.get(bookCh.title);
                                        if (audio) {
                                            chapterToPlayerIndex.set(
                                                bookCh.id,
                                                playerChapters.length,
                                            );
                                            playerChapters.push({
                                                title: bookCh.title,
                                                url: audio.url,
                                                position: bookCh.position,
                                            });
                                        }
                                    }
                                    return (
                                        sortedChapters.length > 0 && (
                                            <>
                                                <ul
                                                    className={styles.audiobookChapterList}
                                                    style={{ marginTop: 16 }}
                                                >
                                                    {sortedChapters.map((bookCh) => {
                                                        const audio = audioByTitle.get(
                                                            bookCh.title,
                                                        );
                                                        const dur = audio
                                                            ? formatDuration(audio.duration_seconds)
                                                            : "";
                                                        const playerIdx = chapterToPlayerIndex.get(
                                                            bookCh.id,
                                                        );
                                                        const isPlaying =
                                                            playingIndex !== null &&
                                                            playerIdx === playingIndex;
                                                        return (
                                                            <li
                                                                key={bookCh.id}
                                                                className={
                                                                    styles.audiobookChapterItem
                                                                }
                                                                style={{
                                                                    flexDirection: "column",
                                                                    alignItems: "stretch",
                                                                    gap: 4,
                                                                    ...(isPlaying
                                                                        ? {
                                                                              borderLeft:
                                                                                  "3px solid var(--accent)",
                                                                              paddingLeft: 5,
                                                                          }
                                                                        : {}),
                                                                }}
                                                            >
                                                                <div className="icon-row">
                                                                    {audio ? (
                                                                        <button
                                                                            className="btn-icon"
                                                                            onClick={() =>
                                                                                setPlayingIndex(
                                                                                    playerIdx ??
                                                                                        null,
                                                                                )
                                                                            }
                                                                            style={{
                                                                                flexShrink: 0,
                                                                                color: isPlaying
                                                                                    ? "var(--accent)"
                                                                                    : "var(--success, #16a34a)",
                                                                            }}
                                                                            title={
                                                                                isPlaying
                                                                                    ? t(
                                                                                          "ui.audiobook.player.pause",
                                                                                          "Pause",
                                                                                      )
                                                                                    : t(
                                                                                          "ui.audiobook.player.play",
                                                                                          "Abspielen",
                                                                                      )
                                                                            }
                                                                        >
                                                                            {isPlaying ? (
                                                                                <Pause size={14} />
                                                                            ) : (
                                                                                <Play size={14} />
                                                                            )}
                                                                        </button>
                                                                    ) : (
                                                                        <Clock
                                                                            size={14}
                                                                            style={{
                                                                                color: "var(--text-muted)",
                                                                                flexShrink: 0,
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <span
                                                                        style={{
                                                                            flex: 1,
                                                                            fontSize: "0.8125rem",
                                                                            fontWeight: isPlaying
                                                                                ? 600
                                                                                : 500,
                                                                            color: isPlaying
                                                                                ? "var(--accent)"
                                                                                : undefined,
                                                                        }}
                                                                    >
                                                                        {bookCh.title}
                                                                    </span>
                                                                    {audio ? (
                                                                        <>
                                                                            {dur && (
                                                                                <span
                                                                                    className={
                                                                                        styles.audiobookMuted
                                                                                    }
                                                                                    style={{
                                                                                        whiteSpace:
                                                                                            "nowrap",
                                                                                    }}
                                                                                >
                                                                                    {dur}
                                                                                </span>
                                                                            )}
                                                                            <span
                                                                                className={
                                                                                    styles.audiobookMuted
                                                                                }
                                                                            >
                                                                                {formatBytes(
                                                                                    audio.size_bytes,
                                                                                )}
                                                                            </span>
                                                                            <a
                                                                                href={audio.url}
                                                                                download={`${bookSlug}-${audio.filename}`}
                                                                                className="btn-icon"
                                                                                title="Download"
                                                                            >
                                                                                <Download
                                                                                    size={12}
                                                                                />
                                                                            </a>
                                                                            <button
                                                                                className="btn-icon"
                                                                                onClick={() =>
                                                                                    handleDeleteChapter(
                                                                                        audio.filename,
                                                                                    )
                                                                                }
                                                                                disabled={busy}
                                                                                title={t(
                                                                                    "ui.common.delete",
                                                                                    "Löschen",
                                                                                )}
                                                                                style={{
                                                                                    color: "var(--danger, #c0392b)",
                                                                                }}
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <span
                                                                            style={{
                                                                                fontSize:
                                                                                    "0.6875rem",
                                                                                color: "var(--text-muted)",
                                                                            }}
                                                                        >
                                                                            {t(
                                                                                "ui.audiobook.chapter_not_generated",
                                                                                "Nicht generiert",
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </li>
                                                        );
                                                    })}
                                                </ul>
                                                {playingIndex !== null &&
                                                    playerChapters.length > 0 && (
                                                        <AudiobookPlayer
                                                            chapters={playerChapters}
                                                            currentIndex={playingIndex}
                                                            bookTitle={
                                                                data.engine
                                                                    ? `${data.engine} / ${data.voice || ""}`
                                                                    : ""
                                                            }
                                                            onChapterChange={setPlayingIndex}
                                                            onClose={() => setPlayingIndex(null)}
                                                        />
                                                    )}
                                            </>
                                        )
                                    );
                                })()}
                            </>
                        );
                    })()}
                </>
            )}

            {/* Previews sub-tab */}
            {subTab === "previews" && (
                <>
                    {!hasPreviews ? (
                        <div className={styles.audiobookMuted}>
                            {t(
                                "ui.audiobook.previews_empty",
                                "Keine Previews vorhanden. Nutze den Vorhören-Button im Editor um eine Vorschau zu erstellen.",
                            )}
                        </div>
                    ) : (
                        <>
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "flex-end",
                                    marginBottom: 8,
                                }}
                            >
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={handleDeleteAllPreviews}
                                    disabled={busy}
                                    style={{ color: "var(--danger, #c0392b)", fontSize: "0.75rem" }}
                                >
                                    <Trash2 size={10} />{" "}
                                    {t("ui.audiobook.delete_all_previews", "Alle löschen")}
                                </button>
                            </div>
                            <ul className={styles.audiobookChapterList}>
                                {previews.map((p) => (
                                    <li
                                        key={p.filename}
                                        className={styles.audiobookChapterItem}
                                        style={{
                                            flexDirection: "column",
                                            alignItems: "stretch",
                                            gap: 4,
                                        }}
                                    >
                                        <div className="icon-row">
                                            <span
                                                style={{
                                                    flex: 1,
                                                    fontSize: "0.75rem",
                                                    wordBreak: "break-all",
                                                }}
                                            >
                                                {p.filename}
                                            </span>
                                            <span className={styles.audiobookMuted}>
                                                {formatBytes(p.size_bytes)}
                                            </span>
                                            <a
                                                href={p.url}
                                                download
                                                className="btn-icon"
                                                title="Download"
                                            >
                                                <Download size={12} />
                                            </a>
                                            <button
                                                className="btn-icon"
                                                onClick={() => handleDeletePreview(p.filename)}
                                                disabled={busy}
                                                title={t("ui.common.delete", "Löschen")}
                                                style={{ color: "var(--danger, #c0392b)" }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                        <audio
                                            controls
                                            src={p.url}
                                            style={{ width: "100%", height: 28 }}
                                            preload="none"
                                        />
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
