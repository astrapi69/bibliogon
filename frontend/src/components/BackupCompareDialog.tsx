import {useState} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {GitCompare, Upload, Loader2, AlertCircle, Info} from "lucide-react";
import {
    ApiError,
    BackupChapterDiff,
    BackupCompareResult,
    BackupDiffLine,
    BackupMetadataChange,
    api,
} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";

interface Props {
    open: boolean;
    onClose: () => void;
}

export default function BackupCompareDialog({open, onClose}: Props) {
    const {t} = useI18n();
    const [fileA, setFileA] = useState<File | null>(null);
    const [fileB, setFileB] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BackupCompareResult | null>(null);

    function reset() {
        setFileA(null);
        setFileB(null);
        setResult(null);
        setLoading(false);
    }

    async function handleCompare() {
        if (!fileA || !fileB) return;
        setLoading(true);
        try {
            const data = await api.backup.compare(fileA, fileB);
            setResult(data);
        } catch (err) {
            const msg = err instanceof ApiError ? err.detail : t("ui.backup.compare.error_generic", "Vergleich fehlgeschlagen");
            notify.error(msg);
            setResult(null);
        } finally {
            setLoading(false);
        }
    }

    function handleClose() {
        reset();
        onClose();
    }

    return (
        <Dialog.Root open={open} onOpenChange={(v) => !v && handleClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content className="dialog-content backup-compare-dialog" style={{maxWidth: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column"}}>
                    <Dialog.Title className="dialog-title">
                        <GitCompare size={20} style={{marginRight: "0.5rem", verticalAlign: "text-bottom"}} />
                        {t("ui.backup.compare.title", "Backups vergleichen")}
                    </Dialog.Title>
                    <Dialog.Description className="dialog-description" asChild>
                        <div style={{display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.75rem", background: "var(--color-bg-subtle)", borderRadius: "6px", marginBottom: "1rem"}}>
                            <Info size={16} style={{marginTop: "2px", flexShrink: 0}} />
                            <span style={{fontSize: "0.9em"}}>
                                {t("ui.backup.compare.transition_note", "Eine integrierte Versionsverwaltung mit automatischen Speicherpunkten ist in Planung. Fuer jetzt kannst du zwei beliebige .bgb-Backups aus deinem Dateisystem miteinander vergleichen.")}
                            </span>
                        </div>
                    </Dialog.Description>

                    {!result && (
                        <div style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
                            <FilePickerRow
                                label={t("ui.backup.compare.file_a_label", "Backup A (aelterer Stand)")}
                                file={fileA}
                                onChange={setFileA}
                            />
                            <FilePickerRow
                                label={t("ui.backup.compare.file_b_label", "Backup B (neuerer Stand)")}
                                file={fileB}
                                onChange={setFileB}
                            />
                            <div style={{display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem"}}>
                                <button type="button" onClick={handleClose} className="btn-secondary">
                                    {t("ui.common.cancel", "Abbrechen")}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCompare}
                                    disabled={!fileA || !fileB || loading}
                                    className="btn-primary"
                                >
                                    {loading ? <Loader2 size={16} className="spin" /> : <GitCompare size={16} />}
                                    {t("ui.backup.compare.compare_button", "Vergleichen")}
                                </button>
                            </div>
                        </div>
                    )}

                    {result && (
                        <div style={{flex: 1, overflowY: "auto", minHeight: 0}}>
                            <CompareResultView result={result} />
                            <div style={{display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "1rem", paddingTop: "0.75rem", borderTop: "1px solid var(--color-border)"}}>
                                <button type="button" onClick={reset} className="btn-secondary">
                                    {t("ui.backup.compare.new_comparison", "Neuer Vergleich")}
                                </button>
                                <button type="button" onClick={handleClose} className="btn-primary">
                                    {t("ui.common.close", "Schliessen")}
                                </button>
                            </div>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}


function FilePickerRow({label, file, onChange}: {label: string; file: File | null; onChange: (f: File | null) => void}) {
    return (
        <label style={{display: "flex", flexDirection: "column", gap: "0.25rem"}}>
            <span style={{fontWeight: 500}}>{label}</span>
            <div style={{display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.5rem", border: "1px dashed var(--color-border)", borderRadius: "4px"}}>
                <Upload size={16} />
                <input
                    type="file"
                    accept=".bgb"
                    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                    style={{flex: 1}}
                />
                {file && <span style={{fontSize: "0.85em", color: "var(--color-text-muted)"}}>{formatBytes(file.size)}</span>}
            </div>
        </label>
    );
}


function CompareResultView({result}: {result: BackupCompareResult}) {
    const {t} = useI18n();
    const {summary, books} = result;

    return (
        <div style={{display: "flex", flexDirection: "column", gap: "1rem"}}>
            <div style={{padding: "0.75rem", background: "var(--color-bg-subtle)", borderRadius: "6px"}}>
                <div style={{fontWeight: 500, marginBottom: "0.25rem"}}>
                    {t("ui.backup.compare.summary_title", "Uebersicht")}
                </div>
                <div style={{fontSize: "0.9em", color: "var(--color-text-muted)"}}>
                    {t("ui.backup.compare.summary_books", "Gemeinsame Buecher:")} {summary.books_in_both}
                    {summary.books_only_in_a.length > 0 && (
                        <> &middot; {t("ui.backup.compare.only_in_a", "Nur in A:")} {summary.books_only_in_a.length}</>
                    )}
                    {summary.books_only_in_b.length > 0 && (
                        <> &middot; {t("ui.backup.compare.only_in_b", "Nur in B:")} {summary.books_only_in_b.length}</>
                    )}
                </div>
            </div>

            {books.map((book) => (
                <BookDiffView key={book.book_id} book={book} />
            ))}
        </div>
    );
}


function BookDiffView({book}: {book: {
    book_id: string;
    title_a: string | null;
    title_b: string | null;
    metadata_changes: BackupMetadataChange[];
    chapter_count_a: number;
    chapter_count_b: number;
    chapters: BackupChapterDiff[];
}}) {
    const {t} = useI18n();
    const noChanges = book.metadata_changes.length === 0 && book.chapters.length === 0;

    return (
        <section style={{border: "1px solid var(--color-border)", borderRadius: "6px", padding: "0.75rem"}}>
            <header style={{marginBottom: "0.5rem"}}>
                <strong>{book.title_b || book.title_a || book.book_id}</strong>
                <div style={{fontSize: "0.8em", color: "var(--color-text-muted)"}}>
                    {t("ui.backup.compare.chapters_count", "Kapitel:")} {book.chapter_count_a} &rarr; {book.chapter_count_b}
                </div>
            </header>

            {noChanges && (
                <div style={{padding: "0.5rem", color: "var(--color-text-muted)", fontStyle: "italic"}}>
                    {t("ui.backup.compare.no_changes", "Keine Aenderungen")}
                </div>
            )}

            {book.metadata_changes.length > 0 && (
                <div style={{marginBottom: "0.75rem"}}>
                    <div style={{fontWeight: 500, marginBottom: "0.25rem"}}>{t("ui.backup.compare.metadata_heading", "Metadaten")}</div>
                    <table style={{width: "100%", borderCollapse: "collapse", fontSize: "0.85em"}}>
                        <thead>
                            <tr style={{background: "var(--color-bg-subtle)"}}>
                                <th style={{textAlign: "left", padding: "0.25rem 0.5rem"}}>{t("ui.backup.compare.field", "Feld")}</th>
                                <th style={{textAlign: "left", padding: "0.25rem 0.5rem"}}>{t("ui.backup.compare.before", "Vorher")}</th>
                                <th style={{textAlign: "left", padding: "0.25rem 0.5rem"}}>{t("ui.backup.compare.after", "Nachher")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {book.metadata_changes.map((c) => (
                                <tr key={c.field} style={{borderTop: "1px solid var(--color-border)"}}>
                                    <td style={{padding: "0.25rem 0.5rem", fontFamily: "monospace"}}>{c.field}</td>
                                    <td style={{padding: "0.25rem 0.5rem"}}>{formatValue(c.before)}</td>
                                    <td style={{padding: "0.25rem 0.5rem"}}>{formatValue(c.after)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {book.chapters.map((ch) => (
                <ChapterDiffView key={ch.chapter_id} chapter={ch} />
            ))}
        </section>
    );
}


function ChapterDiffView({chapter}: {chapter: BackupChapterDiff}) {
    const {t} = useI18n();
    const badge = {
        added: {label: t("ui.backup.compare.badge_added", "Hinzugefuegt"), color: "#16a34a"},
        removed: {label: t("ui.backup.compare.badge_removed", "Entfernt"), color: "#dc2626"},
        changed: {label: t("ui.backup.compare.badge_changed", "Geaendert"), color: "#d97706"},
    }[chapter.change_type];

    return (
        <details style={{marginTop: "0.75rem", borderTop: "1px solid var(--color-border)", paddingTop: "0.5rem"}}>
            <summary style={{cursor: "pointer", display: "flex", alignItems: "center", gap: "0.5rem"}}>
                <span style={{background: badge.color, color: "white", padding: "0.1rem 0.4rem", borderRadius: "3px", fontSize: "0.75em"}}>
                    {badge.label}
                </span>
                <strong>{chapter.title_b || chapter.title_a || chapter.chapter_id}</strong>
                {chapter.title_changed && chapter.title_a && chapter.title_b && (
                    <span style={{fontSize: "0.8em", color: "var(--color-text-muted)"}}>
                        ({chapter.title_a} &rarr; {chapter.title_b})
                    </span>
                )}
            </summary>
            <div style={{marginTop: "0.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem"}}>
                <DiffColumn title={t("ui.backup.compare.version_a", "Version A")} lines={chapter.lines} side="a" />
                <DiffColumn title={t("ui.backup.compare.version_b", "Version B")} lines={chapter.lines} side="b" />
            </div>
        </details>
    );
}


function DiffColumn({title, lines, side}: {title: string; lines: BackupDiffLine[]; side: "a" | "b"}) {
    return (
        <div>
            <div style={{fontSize: "0.8em", fontWeight: 500, marginBottom: "0.25rem"}}>{title}</div>
            <pre style={{
                margin: 0,
                padding: "0.5rem",
                background: "var(--color-bg-subtle)",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                fontSize: "0.8em",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: "300px",
                overflowY: "auto",
            }}>
                {lines.map((line, i) => {
                    const show =
                        (side === "a" && (line.type === "removed" || line.type === "unchanged")) ||
                        (side === "b" && (line.type === "added" || line.type === "unchanged"));
                    if (!show) return null;
                    const bg =
                        line.type === "removed" ? "rgba(220, 38, 38, 0.15)" :
                        line.type === "added" ? "rgba(22, 163, 74, 0.15)" :
                        "transparent";
                    return (
                        <div key={i} style={{background: bg, padding: "0 0.25rem"}}>
                            {line.text || "\u00a0"}
                        </div>
                    );
                })}
            </pre>
        </div>
    );
}


function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}


function formatValue(value: unknown): string {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
}
