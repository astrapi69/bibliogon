import {useEffect, useRef, useState} from "react";
import {Download, ChevronDown, ChevronUp, Headphones, XCircle, AlertTriangle, CheckCircle, Clock, RefreshCw} from "lucide-react";
import {ApiError, AudiobookClassification, DryRunResult, api} from "../api/client";
import HelpLink from "./help/HelpLink";
import {useAudiobookJob} from "../contexts/AudiobookJobContext";
import {useDialog} from "./AppDialog";
import {useI18n} from "../hooks/useI18n";
import {notify} from "../utils/notify";
import OrderedListEditor from "./OrderedListEditor";
import * as Dialog from "@radix-ui/react-dialog";
import styles from "./ExportDialog.module.css";

interface Props {
    open: boolean;
    bookId: string;
    bookTitle: string;
    hasManualToc: boolean;
    onClose: () => void;
}

interface FormatDef {
    id: string;
    labelKey: string;
    labelFallback: string;
    descKey: string;
    descFallback: string;
}

const FORMATS: FormatDef[] = [
    {id: "epub", labelKey: "ui.formats.epub", labelFallback: "EPUB", descKey: "ui.formats.epub_desc", descFallback: "E-Book Format"},
    {id: "pdf", labelKey: "ui.formats.pdf", labelFallback: "PDF", descKey: "ui.formats.pdf_desc", descFallback: "Druckfertig"},
    {id: "docx", labelKey: "ui.formats.docx", labelFallback: "Word", descKey: "ui.formats.docx_desc", descFallback: "Für Lektorate"},
    {id: "html", labelKey: "ui.formats.html", labelFallback: "HTML", descKey: "ui.formats.html_desc", descFallback: "Web-Version"},
    {id: "markdown", labelKey: "ui.formats.markdown", labelFallback: "Markdown", descKey: "ui.formats.markdown_desc", descFallback: "Rohtext"},
    {id: "project", labelKey: "ui.formats.project", labelFallback: "Projekt (ZIP)", descKey: "ui.formats.project_desc", descFallback: "Manuscripta-Projektstruktur"},
    {id: "audiobook", labelKey: "ui.formats.audiobook", labelFallback: "Audiobook (MP3)", descKey: "ui.formats.audiobook_desc", descFallback: "TTS-generiertes Hörbuch"},
];

interface BookTypeDef {
    id: string;
    labelKey: string;
    labelFallback: string;
}

const BOOK_TYPES: BookTypeDef[] = [
    {id: "ebook", labelKey: "ui.export_dialog.ebook", labelFallback: "E-Book"},
    {id: "paperback", labelKey: "ui.export_dialog.paperback", labelFallback: "Taschenbuch"},
    {id: "hardcover", labelKey: "ui.export_dialog.hardcover", labelFallback: "Hardcover"},
];

export default function ExportDialog({open, bookId, bookTitle, hasManualToc, onClose}: Props) {
    const {t} = useI18n();
    const [format, setFormat] = useState("epub");
    const [bookType, setBookType] = useState("ebook");
    const [tocDepth, setTocDepth] = useState(2);
    const [useManualToc, setUseManualToc] = useState(hasManualToc);
    const [aiAssisted, setAiAssisted] = useState(false);
    const [showSectionOrder, setShowSectionOrder] = useState(false);
    const [sectionOrders, setSectionOrders] = useState<Record<string, string[] | null>>({});
    const [exporting, setExporting] = useState(false);

    // Load default section_order from export plugin config
    useEffect(() => {
        if (!open) return;
        api.settings.getPlugin("export").then((config) => {
            const settings = (config.settings || {}) as Record<string, unknown>;
            const order = settings.section_order as Record<string, string[] | null> | undefined;
            if (order) {
                setSectionOrders(order);
            }
            const depth = settings.toc_depth;
            if (typeof depth === "number") setTocDepth(depth);
        }).catch(() => {});
    }, [open]);

    const currentOrder = sectionOrders[bookType] || sectionOrders.ebook || sectionOrders.default || [];
    const selectedFormatLabel = FORMATS.find((f) => f.id === format);

    // The audiobook export hands off to a global context so the progress
    // modal lives at the App root - that lets the user minimize it,
    // navigate freely, and pop it back open from a corner badge.
    const audiobookJob = useAudiobookJob();
    const dialog = useDialog();

    // --- Regeneration mode dialog state ---
    const [regenOpen, setRegenOpen] = useState(false);
    const [regenClassification, setRegenClassification] = useState<AudiobookClassification | null>(null);
    const [regenMode, setRegenMode] = useState<string>("missing_and_outdated");
    const [regenLoading, setRegenLoading] = useState(false);

    const handleExport = async () => {
        setExporting(true);

        if (format === "audiobook") {
            _startAudiobookExport();
            return;
        }

        const params = new URLSearchParams();
        if (bookType !== "ebook") params.set("book_type", bookType);
        if (tocDepth !== 2) params.set("toc_depth", String(tocDepth));
        if (hasManualToc) params.set("use_manual_toc", String(useManualToc));

        try {
            await api.documentExport.download(bookId, format, params);
            onClose();
        } catch (err) {
            // 422 missing_images carries the unresolved file list in
            // detailBody.unresolved; show specific files, not a generic
            // message, so the user can act on it.
            if (
                err instanceof ApiError &&
                err.status === 422 &&
                err.detailBody &&
                (err.detailBody as {code?: string}).code === "missing_images"
            ) {
                const unresolved = ((err.detailBody as {unresolved?: string[]}).unresolved) || [];
                const files = unresolved.join(", ");
                const message = t("ui.export_dialog.missing_images", "Fehlende Bilder: {files}")
                    .replace("{files}", files);
                notify.error(message, err);
            } else {
                const detail = err instanceof ApiError ? err.detail : String(err);
                notify.error(detail, err);
            }
        } finally {
            setExporting(false);
        }
    };

    const _startAudiobookExport = async (confirmOverwrite: boolean = false, generationMode: string = "missing_and_outdated") => {
        try {
            const {job_id} = await api.exportJobs.startAudiobook(bookId, confirmOverwrite, generationMode);
            audiobookJob.start(job_id, bookId, bookTitle);
            onClose();
        } catch (err) {
            // 409 with audiobook_exists -> fetch classification and open the
            // regeneration-mode dialog with radio choices.
            if (
                err instanceof ApiError &&
                err.status === 409 &&
                err.detailBody &&
                (err.detailBody as {code?: string}).code === "audiobook_exists"
            ) {
                try {
                    const classification = await api.bookAudiobook.classify(bookId);
                    setRegenClassification(classification);
                    // Pre-select the most useful default
                    const hasMissing = classification.missing.length > 0;
                    const hasOutdated = classification.outdated.length > 0;
                    if (hasMissing && hasOutdated) setRegenMode("missing_and_outdated");
                    else if (hasMissing) setRegenMode("missing_only");
                    else if (hasOutdated) setRegenMode("outdated_only");
                    else setRegenMode("all");
                    setRegenOpen(true);
                } catch (classifyErr) {
                    // If classification fails, fall back to simple confirm
                    const confirmed = await dialog.confirm(
                        t("ui.audiobook.regen_title", "Audiobook bereits vorhanden"),
                        t("ui.audiobook.regen_warning", "Audiobook neu generieren?"),
                        "danger",
                    );
                    if (confirmed) {
                        await _startAudiobookExport(true, "missing_and_outdated");
                        return;
                    }
                }
                setExporting(false);
                return;
            }
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(t("ui.export_dialog.audiobook_failed", "Audiobook-Export fehlgeschlagen") + ": " + detail, err);
            setExporting(false);
        }
    };

    const handleRegenConfirm = async () => {
        setRegenOpen(false);
        setRegenLoading(true);
        await _startAudiobookExport(true, regenMode);
        setRegenLoading(false);
    };

    const handleRegenCancel = () => {
        setRegenOpen(false);
        setExporting(false);
    };

    // --- Dry-run (test export with first paragraph) ---
    const [dryRunLoading, setDryRunLoading] = useState(false);
    const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const handleDryRun = async () => {
        setDryRunLoading(true);
        setDryRunResult(null);
        try {
            const result = await api.bookAudiobook.dryRun(bookId);
            setDryRunResult(result);
        } catch (err) {
            const detail = err instanceof ApiError ? err.detail : String(err);
            notify.error(t("ui.export_dialog.dry_run_failed", "Test-Export fehlgeschlagen") + ": " + detail, err);
        }
        setDryRunLoading(false);
    };

    // Clean up blob URL when dialog closes
    useEffect(() => {
        if (!open && dryRunResult?.audioUrl) {
            URL.revokeObjectURL(dryRunResult.audioUrl);
            setDryRunResult(null);
        }
    }, [open]);

    return (
        <>
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide">
                    {/* Header */}
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title" style={{display: "flex", alignItems: "center", gap: 6}}>
                            {t("ui.export_dialog.title", "Export")}: {bookTitle}
                            <HelpLink slug={format === "audiobook" ? "export/audiobook" : `export/${format === "project" ? "epub" : format}`}/>
                        </Dialog.Title>
                    </div>

                    {/* Format selection */}
                    <div style={{marginBottom: 20}}>
                        <label className="label">{t("ui.export_dialog.format", "Format")}</label>
                        <div className={styles.formatGrid}>
                            {FORMATS.map((f) => (
                                <button
                                    key={f.id}
                                    className={`${styles.formatBtn} ${format === f.id ? styles.formatBtnActive : ""}`}
                                    onClick={() => setFormat(f.id)}
                                >
                                    <strong>{t(f.labelKey, f.labelFallback)}</strong>
                                    <span style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>{t(f.descKey, f.descFallback)}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Book type (not for project, markdown, audiobook) */}
                    {format !== "project" && format !== "markdown" && format !== "audiobook" && (
                        <div style={{marginBottom: 16}}>
                            <label className="label">{t("ui.export_dialog.book_type", "Buchtyp")}</label>
                            <div style={{display: "flex", gap: 8}}>
                                {BOOK_TYPES.map((bt) => (
                                    <button
                                        key={bt.id}
                                        className={`btn btn-sm ${bookType === bt.id ? "btn-primary" : "btn-secondary"}`}
                                        onClick={() => setBookType(bt.id)}
                                    >
                                        {t(bt.labelKey, bt.labelFallback)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TOC depth (not for project, audiobook) */}
                    {format !== "project" && format !== "audiobook" && (
                        <div className="field">
                            <label className="label">{t("ui.export_dialog.toc_depth", "Inhaltsverzeichnis-Tiefe")}</label>
                            <select className="input" value={tocDepth} onChange={(e) => setTocDepth(Number(e.target.value))}
                                style={{width: "auto"}}>
                                <option value={1}>{t("ui.export_dialog.toc_depth_1", "Tiefe 1 (nur #)")}</option>
                                <option value={2}>{t("ui.export_dialog.toc_depth_2", "Tiefe 2 (# und ##)")}</option>
                                <option value={3}>{t("ui.export_dialog.toc_depth_3", "Tiefe 3 (# ## ###)")}</option>
                            </select>
                        </div>
                    )}

                    {/* Manual TOC checkbox (not for project, audiobook) */}
                    {format !== "project" && format !== "audiobook" && hasManualToc && (
                        <div className="field" style={{marginTop: 8}}>
                            <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.875rem"}}>
                                <input
                                    type="checkbox"
                                    checked={useManualToc}
                                    onChange={(e) => setUseManualToc(e.target.checked)}
                                />
                                {t("ui.export_dialog.use_manual_toc", "Manuelles Inhaltsverzeichnis verwenden")}
                            </label>
                            <span style={{fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 26, display: "block"}}>
                                {useManualToc
                                    ? t("ui.export_dialog.manual_toc_hint", "Das vorhandene Inhaltsverzeichnis wird verwendet (kein automatisch generiertes).")
                                    : t("ui.export_dialog.auto_toc_hint", "Ein Inhaltsverzeichnis wird automatisch generiert (das vorhandene wird ignoriert).")}
                            </span>
                        </div>
                    )}

                    {/* AI-assisted content flag */}
                    <div style={{marginTop: 12}}>
                        <label style={{display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.875rem"}}>
                            <input
                                type="checkbox"
                                checked={aiAssisted}
                                onChange={(e) => setAiAssisted(e.target.checked)}
                                style={{width: 16, height: 16, accentColor: "var(--accent)"}}
                            />
                            {t("ui.export_dialog.ai_assisted", "AI-assistierte Inhalte kennzeichnen")}
                        </label>
                        <span style={{fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: 26, display: "block"}}>
                            {t("ui.export_dialog.ai_assisted_hint", "Einige Plattformen (z.B. Amazon KDP) verlangen die Offenlegung von KI-assistierten Inhalten.")}
                        </span>
                    </div>

                    {/* Section order (collapsible, not for audiobook) */}
                    {format !== "project" && format !== "audiobook" && currentOrder.length > 0 && (
                        <div style={{marginTop: 12}}>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowSectionOrder(!showSectionOrder)}
                                style={{padding: "4px 0", gap: 4}}
                            >
                                {showSectionOrder ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                                {t("ui.export_dialog.section_order", "Kapitelreihenfolge anpassen")} ({bookType})
                            </button>
                            {showSectionOrder && (
                                <div style={{marginTop: 8}}>
                                    <OrderedListEditor
                                        items={currentOrder}
                                        onChange={(newOrder) => {
                                            setSectionOrders((prev) => ({...prev, [bookType]: newOrder}));
                                        }}
                                        addPlaceholder="z.B. back-matter/dedication.md"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Audiobook dry-run section */}
                    {format === "audiobook" && (
                        <div style={{
                            marginTop: 16, padding: 12,
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius-sm)",
                        }}>
                            <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 8}}>
                                <Headphones size={14}/>
                                <strong style={{fontSize: "0.875rem"}}>
                                    {t("ui.export_dialog.dry_run_title", "Test-Export")}
                                </strong>
                            </div>
                            <p style={{fontSize: "0.75rem", color: "var(--text-muted)", margin: "0 0 8px 0"}}>
                                {t("ui.export_dialog.dry_run_hint", "Generiert nur den ersten Absatz des ersten Kapitels. Prüft ob Engine und Stimme funktionieren und zeigt die geschaetzten Kosten.")}
                            </p>
                            {dryRunResult ? (
                                <div style={{display: "flex", flexDirection: "column", gap: 8}}>
                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                    <audio ref={audioRef} controls src={dryRunResult.audioUrl} style={{width: "100%", height: 36}}/>
                                    <div style={{fontSize: "0.75rem", color: "var(--text-secondary)"}}>
                                        {dryRunResult.estimatedChapters} {t("ui.audio_progress.chapters", "Kapitel")}
                                        {" | "}
                                        {t("ui.audio_progress.event_cost", "Kosten")}:{" "}
                                        {dryRunResult.estimatedCostUsd === "free"
                                            ? t("ui.export_dialog.free", "kostenlos")
                                            : `~$${parseFloat(dryRunResult.estimatedCostUsd).toFixed(2)}`}
                                        {" | "}
                                        Engine: {dryRunResult.engine} | Voice: {dryRunResult.voice}
                                    </div>
                                </div>
                            ) : (
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleDryRun}
                                    disabled={dryRunLoading}
                                >
                                    <Headphones size={12}/>
                                    {dryRunLoading
                                        ? t("ui.export_dialog.dry_run_loading", "Generiert Probe...")
                                        : t("ui.export_dialog.dry_run_button", "Probe hören")}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Export buttons */}
                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={onClose}>{t("ui.common.cancel", "Abbrechen")}</button>
                        <button
                            className="btn btn-secondary"
                            onClick={() => {
                                setExporting(true);
                                const params = new URLSearchParams();
                                if (bookType !== "ebook") params.set("book_type", bookType);
                                if (hasManualToc) params.set("use_manual_toc", String(useManualToc));
                                const query = params.toString();
                                window.open(`/api/books/${bookId}/export/batch${query ? `?${query}` : ""}`, "_blank");
                                setTimeout(() => { setExporting(false); onClose(); }, 1500);
                            }}
                            disabled={exporting}
                        >
                            <Download size={16}/>
                            {t("ui.export_dialog.export_all", "Alle Formate (ZIP)")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleExport}
                            disabled={exporting}
                        >
                            <Download size={16}/>
                            {exporting
                                ? t("ui.export_dialog.exporting", "Exportiert...")
                                : t("ui.export_dialog.export_as", "Als {format} exportieren").replace("{format}", selectedFormatLabel ? t(selectedFormatLabel.labelKey, selectedFormatLabel.labelFallback) : "")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>

        {/* --- Regeneration mode dialog --- */}
        <Dialog.Root open={regenOpen} onOpenChange={(open) => { if (!open) handleRegenCancel(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content" style={{maxWidth: 520}} onEscapeKeyDown={handleRegenCancel}>
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">
                            {t("ui.audiobook.regen_title", "Audiobook bereits vorhanden")}
                        </Dialog.Title>
                    </div>
                    {regenClassification && (() => {
                        const cur = regenClassification.current.length;
                        const out = regenClassification.outdated.length;
                        const mis = regenClassification.missing.length;
                        const total = cur + out + mis;
                        const modes = [
                            {value: "missing_only", count: mis, icon: <Clock size={14}/>,
                                label: t("ui.audiobook.regen_mode_missing", "Nur fehlende generieren ({n})")
                                    .replace("{n}", String(mis)),
                                disabled: mis === 0},
                            {value: "outdated_only", count: out, icon: <RefreshCw size={14}/>,
                                label: t("ui.audiobook.regen_mode_outdated", "Nur veraltete neu generieren ({n})")
                                    .replace("{n}", String(out)),
                                disabled: out === 0},
                            {value: "missing_and_outdated", count: mis + out,
                                icon: <CheckCircle size={14} style={{color: "var(--success, #16a34a)"}}/>,
                                label: t("ui.audiobook.regen_mode_standard", "Fehlende und veraltete generieren ({n})")
                                    .replace("{n}", String(mis + out)),
                                recommended: true,
                                disabled: mis + out === 0},
                            {value: "all", count: total,
                                icon: <AlertTriangle size={14} style={{color: "var(--danger, #c0392b)"}}/>,
                                label: t("ui.audiobook.regen_mode_all", "Alle neu generieren ({n})")
                                    .replace("{n}", String(total)),
                                disabled: false},
                        ];
                        return (
                            <>
                                <Dialog.Description asChild>
                                    <div style={{fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: 16}}>
                                        <div style={{display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8}}>
                                            <span style={{display: "flex", alignItems: "center", gap: 4}}>
                                                <CheckCircle size={12} style={{color: "var(--success, #16a34a)"}}/>
                                                {t("ui.audiobook.regen_count_current", "{n} aktuell").replace("{n}", String(cur))}
                                            </span>
                                            {out > 0 && <span style={{display: "flex", alignItems: "center", gap: 4}}>
                                                <RefreshCw size={12} style={{color: "var(--warning, #e67e22)"}}/>
                                                {t("ui.audiobook.regen_count_outdated", "{n} veraltet").replace("{n}", String(out))}
                                            </span>}
                                            {mis > 0 && <span style={{display: "flex", alignItems: "center", gap: 4}}>
                                                <Clock size={12} className="muted"/>
                                                {t("ui.audiobook.regen_count_missing", "{n} fehlend").replace("{n}", String(mis))}
                                            </span>}
                                        </div>
                                    </div>
                                </Dialog.Description>

                                <div style={{display: "flex", flexDirection: "column", gap: 6, marginBottom: 16}} role="radiogroup">
                                    {modes.map((mode) => (
                                        <label
                                            key={mode.value}
                                            style={{
                                                display: "flex", alignItems: "center", gap: 10,
                                                padding: "8px 12px",
                                                borderRadius: "var(--radius-sm)",
                                                border: regenMode === mode.value ? "1px solid var(--accent)" : "1px solid var(--border)",
                                                background: regenMode === mode.value ? "var(--accent-light, rgba(59,130,246,0.06))" : "var(--bg-primary)",
                                                cursor: mode.disabled ? "not-allowed" : "pointer",
                                                opacity: mode.disabled ? 0.5 : 1,
                                                fontSize: "0.8125rem",
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="regen-mode"
                                                value={mode.value}
                                                checked={regenMode === mode.value}
                                                onChange={() => setRegenMode(mode.value)}
                                                disabled={mode.disabled}
                                                style={{accentColor: "var(--accent)"}}
                                            />
                                            {mode.icon}
                                            <span style={{flex: 1}}>{mode.label}</span>
                                            {mode.recommended && (
                                                <span style={{
                                                    fontSize: "0.6875rem", fontWeight: 600,
                                                    color: "var(--accent)", textTransform: "uppercase",
                                                    letterSpacing: "0.05em",
                                                }}>
                                                    {t("ui.audiobook.regen_recommended", "Empfohlen")}
                                                </span>
                                            )}
                                        </label>
                                    ))}
                                </div>
                            </>
                        );
                    })()}
                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={handleRegenCancel}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleRegenConfirm}
                            disabled={regenLoading}
                            autoFocus
                        >
                            <Download size={14}/>
                            {regenLoading
                                ? t("ui.export_dialog.exporting", "Exportiert...")
                                : t("ui.audiobook.regen_generate", "Generieren")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
        </>
    );
}

