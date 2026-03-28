import {useEffect, useState} from "react";
import {Download, X, ChevronDown, ChevronUp} from "lucide-react";
import {api} from "../api/client";
import OrderedListEditor from "./OrderedListEditor";

interface Props {
    bookId: string;
    bookTitle: string;
    onClose: () => void;
}

const FORMATS = [
    {id: "epub", label: "EPUB", description: "E-Book Format"},
    {id: "pdf", label: "PDF", description: "Druckfertig"},
    {id: "docx", label: "Word", description: "Fuer Lektorate"},
    {id: "html", label: "HTML", description: "Web-Version"},
    {id: "markdown", label: "Markdown", description: "Rohtext"},
    {id: "project", label: "Projekt (ZIP)", description: "Manuscripta-Projektstruktur"},
];

const BOOK_TYPES = [
    {id: "ebook", label: "E-Book"},
    {id: "paperback", label: "Taschenbuch"},
    {id: "hardcover", label: "Hardcover"},
];

export default function ExportDialog({bookId, bookTitle, onClose}: Props) {
    const [format, setFormat] = useState("epub");
    const [bookType, setBookType] = useState("ebook");
    const [tocDepth, setTocDepth] = useState(2);
    const [showSectionOrder, setShowSectionOrder] = useState(false);
    const [sectionOrders, setSectionOrders] = useState<Record<string, string[] | null>>({});
    const [exporting, setExporting] = useState(false);

    // Load default section_order from export plugin config
    useEffect(() => {
        api.settings.getPlugin("export").then((config) => {
            const settings = (config.settings || {}) as Record<string, unknown>;
            const order = settings.section_order as Record<string, string[] | null> | undefined;
            if (order) {
                setSectionOrders(order);
            }
            const depth = settings.toc_depth;
            if (typeof depth === "number") setTocDepth(depth);
        }).catch(() => {});
    }, []);

    const currentOrder = sectionOrders[bookType] || sectionOrders.ebook || sectionOrders.default || [];

    const handleExport = () => {
        setExporting(true);
        const params = new URLSearchParams();
        if (bookType !== "ebook") params.set("book_type", bookType);
        if (tocDepth !== 2) params.set("toc_depth", String(tocDepth));

        const query = params.toString();
        const url = `/api/books/${bookId}/export/${format}${query ? `?${query}` : ""}`;
        window.open(url, "_blank");

        setTimeout(() => {
            setExporting(false);
            onClose();
        }, 1000);
    };

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.modalHeader}>
                    <h2 style={styles.modalTitle}>Export: {bookTitle}</h2>
                    <button style={styles.closeBtn} onClick={onClose}>
                        <X size={18}/>
                    </button>
                </div>

                {/* Format selection */}
                <div style={{marginBottom: 20}}>
                    <label className="label">Format</label>
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
                                <strong>{f.label}</strong>
                                <span style={{fontSize: "0.75rem", color: "var(--text-muted)"}}>{f.description}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Book type */}
                {format !== "project" && format !== "markdown" && (
                    <div style={{marginBottom: 16}}>
                        <label className="label">Buchtyp</label>
                        <div style={{display: "flex", gap: 8}}>
                            {BOOK_TYPES.map((bt) => (
                                <button
                                    key={bt.id}
                                    className={`btn btn-sm ${bookType === bt.id ? "btn-primary" : "btn-secondary"}`}
                                    onClick={() => setBookType(bt.id)}
                                >
                                    {bt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* TOC depth */}
                {format !== "project" && (
                    <div className="field">
                        <label className="label">Inhaltsverzeichnis-Tiefe</label>
                        <select className="input" value={tocDepth} onChange={(e) => setTocDepth(Number(e.target.value))}
                            style={{width: "auto"}}>
                            <option value={1}>Tiefe 1 (nur #)</option>
                            <option value={2}>Tiefe 2 (# und ##)</option>
                            <option value={3}>Tiefe 3 (# ## ###)</option>
                        </select>
                    </div>
                )}

                {/* Section order (collapsible) */}
                {format !== "project" && currentOrder.length > 0 && (
                    <div style={{marginTop: 12}}>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setShowSectionOrder(!showSectionOrder)}
                            style={{padding: "4px 0", gap: 4}}
                        >
                            {showSectionOrder ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
                            Kapitelreihenfolge anpassen ({bookType})
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

                {/* Export button */}
                <div style={{display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20}}>
                    <button className="btn btn-ghost" onClick={onClose}>Abbrechen</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleExport}
                        disabled={exporting}
                    >
                        <Download size={16}/>
                        {exporting ? "Exportiert..." : `Als ${FORMATS.find((f) => f.id === format)?.label} exportieren`}
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)", display: "flex",
        alignItems: "center", justifyContent: "center", zIndex: 1000,
    },
    modal: {
        background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
        padding: 24, width: "100%", maxWidth: 560,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "var(--shadow-lg)",
    },
    modalHeader: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20,
    },
    modalTitle: {
        fontFamily: "var(--font-display)", fontSize: "1.125rem", fontWeight: 600,
    },
    closeBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: 4, borderRadius: 4,
        display: "flex", alignItems: "center",
    },
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
