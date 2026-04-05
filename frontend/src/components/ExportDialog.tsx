import {useEffect, useState} from "react";
import {Download, ChevronDown, ChevronUp} from "lucide-react";
import {api} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import OrderedListEditor from "./OrderedListEditor";
import * as Dialog from "@radix-ui/react-dialog";

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
    {id: "docx", labelKey: "ui.formats.docx", labelFallback: "Word", descKey: "ui.formats.docx_desc", descFallback: "Fuer Lektorate"},
    {id: "html", labelKey: "ui.formats.html", labelFallback: "HTML", descKey: "ui.formats.html_desc", descFallback: "Web-Version"},
    {id: "markdown", labelKey: "ui.formats.markdown", labelFallback: "Markdown", descKey: "ui.formats.markdown_desc", descFallback: "Rohtext"},
    {id: "project", labelKey: "ui.formats.project", labelFallback: "Projekt (ZIP)", descKey: "ui.formats.project_desc", descFallback: "Manuscripta-Projektstruktur"},
    {id: "audiobook", labelKey: "ui.formats.audiobook", labelFallback: "Audiobook (MP3)", descKey: "ui.formats.audiobook_desc", descFallback: "TTS-generiertes Hoerbuch"},
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

    const handleExport = () => {
        setExporting(true);
        const params = new URLSearchParams();
        if (bookType !== "ebook") params.set("book_type", bookType);
        if (tocDepth !== 2) params.set("toc_depth", String(tocDepth));
        if (hasManualToc) params.set("use_manual_toc", String(useManualToc));

        const query = params.toString();
        const url = `/api/books/${bookId}/export/${format}${query ? `?${query}` : ""}`;
        window.open(url, "_blank");

        setTimeout(() => {
            setExporting(false);
            onClose();
        }, 1000);
    };

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide">
                    {/* Header */}
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">{t("ui.export_dialog.title", "Export")}: {bookTitle}</Dialog.Title>
                    </div>

                    {/* Format selection */}
                    <div style={{marginBottom: 20}}>
                        <label className="label">{t("ui.export_dialog.format", "Format")}</label>
                        <div style={styles.formatGrid}>
                            {FORMATS.map((f) => (
                                <button
                                    key={f.id}
                                    style={{
                                        ...styles.formatBtn,
                                        ...(format === f.id ? styles.formatBtnActive : {}),
                                    }}
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
    );
}

const styles: Record<string, React.CSSProperties> = {
    formatGrid: {
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8,
    },
    formatBtn: {
        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
        padding: "12px 8px", border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)", background: "var(--bg-primary)",
        cursor: "pointer", transition: "all 150ms",
        fontFamily: "var(--font-body)", fontSize: "0.875rem",
        color: "var(--text-primary)",
    },
    formatBtnActive: {
        borderColor: "var(--accent)", background: "var(--accent-light)",
        color: "var(--accent)",
    },
};
