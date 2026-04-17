import {useState, useEffect} from "react";
import {api, ApiError, BookCreate, BookFromTemplateCreate, BookTemplate} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {useDialog} from "./AppDialog";
import {notify} from "../utils/notify";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import {ChevronDown, ChevronRight, Lock, Trash2} from "lucide-react";

type Mode = "blank" | "template";

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (data: BookCreate) => void;
    onCreateFromTemplate?: (data: BookFromTemplateCreate) => void;
}

export default function CreateBookModal({open, onClose, onCreate, onCreateFromTemplate}: Props) {
    const {t} = useI18n();
    const dialog = useDialog();
    const GENRE_KEYS = [
        "novel", "non_fiction", "technical", "children", "biography", "poetry",
        "short_stories", "academic", "textbook", "self_help", "fantasy",
        "thriller", "romance", "cookbook", "travel",
    ];

    // Mode (Blank vs. From template)
    const [mode, setMode] = useState<Mode>("blank");

    // Stage 1: Required
    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [authorChoices, setAuthorChoices] = useState<string[]>([]);
    // Stage 2: Optional (collapsed by default)
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [genre, setGenre] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [language, setLanguage] = useState("de");
    const [description, setDescription] = useState("");
    const [isSeries, setIsSeries] = useState(false);
    const [series, setSeries] = useState("");
    const [seriesIndex, setSeriesIndex] = useState("");

    // Template state
    const [templates, setTemplates] = useState<BookTemplate[] | null>(null);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

    const handleDeleteTemplate = async (tpl: BookTemplate) => {
        if (tpl.is_builtin) return;
        const ok = await dialog.confirm(
            t("ui.template_picker.delete_title", "Vorlage loeschen"),
            t("ui.template_picker.delete_confirm", "Vorlage '{name}' wirklich loeschen? Dies kann nicht rueckgaengig gemacht werden.")
                .replace("{name}", tpl.name),
            "danger",
        );
        if (!ok) return;
        try {
            await api.templates.delete(tpl.id);
            setTemplates((prev) => (prev ? prev.filter((t) => t.id !== tpl.id) : prev));
            if (selectedTemplateId === tpl.id) setSelectedTemplateId(null);
            notify.success(t("ui.template_picker.deleted", "Vorlage geloescht"));
        } catch (err) {
            notify.error(
                err instanceof ApiError
                    ? err.detail
                    : t("ui.template_picker.delete_failed", "Loeschen fehlgeschlagen"),
            );
        }
    };

    // Load author profile on open
    useEffect(() => {
        if (!open) return;
        api.settings.getApp().then((config) => {
            const authorConfig = (config.author || {}) as Record<string, unknown>;
            const realName = (authorConfig.name as string) || "";
            const penNames = Array.isArray(authorConfig.pen_names)
                ? (authorConfig.pen_names as string[]).filter(Boolean)
                : [];
            const choices = realName ? [realName, ...penNames] : penNames;
            setAuthorChoices(choices);
            if (!author && realName) {
                setAuthor(realName);
            }
        }).catch(() => {});
    }, [open]);

    // Fetch templates the first time the user switches into template mode
    useEffect(() => {
        if (mode !== "template" || templates !== null) return;
        api.templates.list()
            .then((list) => {
                setTemplates(list);
                setTemplatesError(null);
            })
            .catch((err) => {
                setTemplates([]);
                setTemplatesError(String(err?.message || err));
            });
    }, [mode, templates]);

    // When a template is picked, pre-fill language + description from it
    useEffect(() => {
        if (!selectedTemplateId || !templates) return;
        const tpl = templates.find((t) => t.id === selectedTemplateId);
        if (!tpl) return;
        setLanguage(tpl.language);
        setDescription(tpl.description);
    }, [selectedTemplateId, templates]);

    const resetForm = () => {
        setTitle("");
        setAuthor("");
        setGenre("");
        setLanguage("de");
        setDescription("");
        setSubtitle("");
        setIsSeries(false);
        setSeries("");
        setSeriesIndex("");
        setDetailsOpen(false);
        setSelectedTemplateId(null);
        setMode("blank");
    };

    const handleSubmit = () => {
        if (!title.trim() || !author.trim()) return;

        // Map translated genre back to key (e.g. "Roman" -> "novel")
        let genreValue = genre.trim();
        if (genreValue) {
            const matchedKey = GENRE_KEYS.find(
                (k) => t(`ui.genres.${k}`, k).toLowerCase() === genreValue.toLowerCase()
            );
            if (matchedKey) genreValue = matchedKey;
        }

        if (mode === "template") {
            if (!selectedTemplateId || !onCreateFromTemplate) return;
            onCreateFromTemplate({
                template_id: selectedTemplateId,
                title: title.trim(),
                author: author.trim(),
                language,
                genre: genreValue || undefined,
                subtitle: subtitle.trim() || undefined,
                description: description.trim() || undefined,
                series: series.trim() || undefined,
                series_index: seriesIndex ? parseInt(seriesIndex, 10) : undefined,
            });
        } else {
            onCreate({
                title: title.trim(),
                author: author.trim(),
                language,
                genre: genreValue || undefined,
                subtitle: subtitle.trim() || undefined,
                description: description.trim() || undefined,
                series: series.trim() || undefined,
                series_index: seriesIndex ? parseInt(seriesIndex, 10) : undefined,
            });
        }
        resetForm();
    };

    const canSubmit =
        !!title.trim() &&
        !!author.trim() &&
        (mode === "blank" || !!selectedTemplateId);

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">{t("ui.create_book.title", "Neues Buch")}</Dialog.Title>
                    </div>

                    <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)}>
                        <Tabs.List className="radix-tab-list" style={{marginBottom: 12}}>
                            <Tabs.Trigger
                                value="blank"
                                className="radix-tab-trigger"
                                data-testid="create-book-mode-blank"
                            >
                                {t("ui.create_book.mode_blank", "Leer")}
                            </Tabs.Trigger>
                            <Tabs.Trigger
                                value="template"
                                className="radix-tab-trigger"
                                data-testid="create-book-mode-template"
                            >
                                {t("ui.create_book.mode_template", "Aus Vorlage")}
                            </Tabs.Trigger>
                        </Tabs.List>

                        <Tabs.Content value="template">
                            <div style={styles.templatePickerHeader}>
                                <div className="label">{t("ui.create_book.template_picker_title", "Waehle eine Vorlage")}</div>
                            </div>
                            {templates === null && (
                                <div style={styles.templatesEmpty}>
                                    {t("ui.create_book.template_loading", "Lade Vorlagen...")}
                                </div>
                            )}
                            {templates !== null && templates.length === 0 && (
                                <div style={styles.templatesEmpty}>
                                    {templatesError
                                        ? t("ui.create_book.template_load_error", "Vorlagen konnten nicht geladen werden")
                                        : t("ui.create_book.template_empty", "Keine Vorlagen verfuegbar")}
                                </div>
                            )}
                            {templates !== null && templates.length > 0 && (
                                <div style={styles.templateList} role="radiogroup">
                                    {templates.map((tpl) => {
                                        const selected = tpl.id === selectedTemplateId;
                                        const genreLabel = t(
                                            `ui.template_genres.${tpl.genre}`,
                                            tpl.genre,
                                        );
                                        const select = () => setSelectedTemplateId(tpl.id);
                                        return (
                                            <div
                                                key={tpl.id}
                                                role="radio"
                                                aria-checked={selected}
                                                tabIndex={0}
                                                data-testid={`template-card-${tpl.id}`}
                                                onClick={select}
                                                onKeyDown={(e) => {
                                                    if (e.key === " " || e.key === "Enter") {
                                                        e.preventDefault();
                                                        select();
                                                    }
                                                }}
                                                style={{
                                                    ...styles.templateCard,
                                                    ...(selected ? styles.templateCardSelected : {}),
                                                }}
                                            >
                                                <div style={styles.templateCardHeader}>
                                                    <span style={styles.templateName}>{tpl.name}</span>
                                                    <div style={styles.templateCardBadges}>
                                                        <span style={styles.templateBadge}>{genreLabel}</span>
                                                        {tpl.is_builtin ? (
                                                            <span
                                                                style={styles.builtinBadge}
                                                                title={t("ui.template_picker.builtin_hint", "Mitgelieferte Vorlage")}
                                                                data-testid={`template-builtin-badge-${tpl.id}`}
                                                            >
                                                                <Lock size={10}/>
                                                                {t("ui.template_picker.builtin", "Mitgeliefert")}
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="btn-icon"
                                                                style={styles.deleteBtn}
                                                                aria-label={t("ui.template_picker.delete", "Loeschen")}
                                                                data-testid={`template-delete-${tpl.id}`}
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tpl); }}
                                                            >
                                                                <Trash2 size={14}/>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={styles.templateDescription}>{tpl.description}</div>
                                                <div style={styles.templateMeta}>
                                                    {t("ui.create_book.template_chapter_count", "{count} Kapitel")
                                                        .replace("{count}", String(tpl.chapters.length))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </Tabs.Content>

                        <Tabs.Content value="blank">
                            {/* Blank mode has no extra content above the shared fields */}
                        </Tabs.Content>
                    </Tabs.Root>

                    <div style={styles.body}>
                        {/* === Stage 1: Required fields only === */}
                        <div className="field">
                            <label className="label">{t("ui.create_book.book_title", "Titel")} *</label>
                            <input
                                className="input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={t("ui.create_book.book_title_placeholder", "Der Titel deines Buches")}
                                data-testid="create-book-title"
                                autoFocus
                            />
                        </div>

                        <div className="field">
                            <label className="label">{t("ui.create_book.author", "Autor")} *</label>
                            {authorChoices.length > 0 ? (
                                <Select.Root value={author} onValueChange={setAuthor}>
                                    <Select.Trigger className="radix-select-trigger">
                                        <Select.Value placeholder={t("ui.create_book.author_select", "Autor waehlen...")}/>
                                        <Select.Icon><ChevronDown size={14}/></Select.Icon>
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                                            <Select.Viewport>
                                                {authorChoices.map((name) => (
                                                    <Select.Item key={name} value={name} className="radix-select-item">
                                                        <Select.ItemText>{name}</Select.ItemText>
                                                    </Select.Item>
                                                ))}
                                            </Select.Viewport>
                                        </Select.Content>
                                    </Select.Portal>
                                </Select.Root>
                            ) : (
                                <input
                                    className="input"
                                    value={author}
                                    onChange={(e) => setAuthor(e.target.value)}
                                    placeholder={t("ui.create_book.author_placeholder", "Autorenname oder Pen Name")}
                                    data-testid="create-book-author"
                                />
                            )}
                        </div>

                        {/* === Stage 2: Optional fields (Radix Collapsible) === */}
                        <Collapsible.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
                            <Collapsible.Trigger asChild>
                                <button style={styles.detailsToggle}>
                                    {detailsOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                    {t("ui.create_book.more_details", "Weitere Details")}
                                </button>
                            </Collapsible.Trigger>

                            <Collapsible.Content>
                                <div style={styles.detailsSection}>
                                    <div className="field">
                                        <label className="label">{t("ui.create_book.genre", "Genre")}</label>
                                        <input
                                            className="input"
                                            list="genre-suggestions"
                                            value={genre}
                                            onChange={(e) => setGenre(e.target.value)}
                                            placeholder={t("ui.create_book.genre_placeholder", "Genre waehlen oder eingeben...")}
                                        />
                                        <datalist id="genre-suggestions">
                                            {[
                                                t("ui.genres.novel", "Roman"),
                                                t("ui.genres.non_fiction", "Sachbuch"),
                                                t("ui.genres.technical", "Fachbuch"),
                                                t("ui.genres.children", "Kinderbuch"),
                                                t("ui.genres.biography", "Biografie"),
                                                t("ui.genres.poetry", "Lyrik"),
                                                t("ui.genres.short_stories", "Kurzgeschichten"),
                                                t("ui.genres.academic", "Wissenschaftlich"),
                                                t("ui.genres.textbook", "Lehrbuch"),
                                                t("ui.genres.self_help", "Ratgeber"),
                                                t("ui.genres.fantasy", "Fantasy"),
                                                t("ui.genres.thriller", "Thriller"),
                                                t("ui.genres.romance", "Liebesroman"),
                                                t("ui.genres.cookbook", "Kochbuch"),
                                                t("ui.genres.travel", "Reisefuehrer"),
                                            ].map((g) => (
                                                <option key={g} value={g}/>
                                            ))}
                                        </datalist>
                                    </div>

                                    <div className="field">
                                        <label className="label">{t("ui.create_book.subtitle", "Untertitel")}</label>
                                        <input
                                            className="input"
                                            value={subtitle}
                                            onChange={(e) => setSubtitle(e.target.value)}
                                            placeholder={t("ui.create_book.subtitle_placeholder", "Optional")}
                                        />
                                    </div>

                                    <div className="field">
                                        <label className="label">{t("ui.create_book.description", "Beschreibung")}</label>
                                        <textarea
                                            className="input"
                                            rows={3}
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder={t("ui.create_book.description_placeholder", "Kurze Beschreibung (optional)")}
                                        />
                                    </div>

                                    <div className="field">
                                        <label className="label">{t("ui.create_book.language", "Sprache")}</label>
                                        <Select.Root value={language} onValueChange={setLanguage}>
                                            <Select.Trigger className="radix-select-trigger">
                                                <Select.Value/>
                                                <Select.Icon><ChevronDown size={14}/></Select.Icon>
                                            </Select.Trigger>
                                            <Select.Portal>
                                                <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                                                    <Select.Viewport>
                                                        {[
                                                            {value: "de", label: t("ui.languages.de", "Deutsch")},
                                                            {value: "en", label: t("ui.languages.en", "English")},
                                                            {value: "es", label: t("ui.languages.es", "Espanol")},
                                                            {value: "fr", label: t("ui.languages.fr", "Francais")},
                                                            {value: "el", label: t("ui.languages.el", "Ellinika")},
                                                        ].map((opt) => (
                                                            <Select.Item key={opt.value} value={opt.value} className="radix-select-item">
                                                                <Select.ItemText>{opt.label}</Select.ItemText>
                                                            </Select.Item>
                                                        ))}
                                                    </Select.Viewport>
                                                </Select.Content>
                                            </Select.Portal>
                                        </Select.Root>
                                    </div>

                                    <label style={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={isSeries}
                                            onChange={(e) => {
                                                setIsSeries(e.target.checked);
                                                if (!e.target.checked) { setSeries(""); setSeriesIndex(""); }
                                            }}
                                            style={{accentColor: "var(--accent)"}}
                                        />
                                        {t("ui.create_book.is_series", "Teil einer Serie")}
                                    </label>

                                    {isSeries && (
                                        <div style={styles.row}>
                                            <div className="field" style={{flex: 2}}>
                                                <label className="label">{t("ui.create_book.series", "Reihe")}</label>
                                                <input
                                                    className="input"
                                                    value={series}
                                                    onChange={(e) => setSeries(e.target.value)}
                                                    placeholder={t("ui.create_book.series_placeholder", "z.B. Das unsterbliche Muster")}
                                                />
                                            </div>
                                            <div className="field" style={{flex: 1}}>
                                                <label className="label">{t("ui.create_book.volume", "Band")}</label>
                                                <input
                                                    className="input"
                                                    type="number"
                                                    min="1"
                                                    value={seriesIndex}
                                                    onChange={(e) => setSeriesIndex(e.target.value)}
                                                    placeholder={t("ui.create_book.volume_placeholder", "Nr.")}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Collapsible.Content>
                        </Collapsible.Root>
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={onClose}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            data-testid="create-book-submit"
                        >
                            {t("ui.common.create", "Erstellen")}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

const styles: Record<string, React.CSSProperties> = {
    body: {
        padding: "8px 0 16px",
    },
    row: {
        display: "flex",
        gap: 12,
    },
    detailsToggle: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-muted)",
        fontSize: "0.8125rem",
        fontWeight: 500,
        fontFamily: "var(--font-body)",
        padding: "8px 0 4px",
    },
    detailsSection: {
        paddingTop: 8,
        borderTop: "1px solid var(--border)",
        marginTop: 4,
    },
    checkboxLabel: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        fontSize: "0.875rem",
        marginTop: 8,
    },
    templatePickerHeader: {
        marginBottom: 8,
    },
    templatesEmpty: {
        padding: "16px 0",
        color: "var(--text-muted)",
        fontSize: "0.875rem",
    },
    templateList: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 8,
        marginBottom: 8,
    },
    templateCard: {
        textAlign: "left",
        padding: 12,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        fontFamily: "var(--font-body)",
        color: "var(--text)",
    },
    templateCardSelected: {
        borderColor: "var(--accent)",
        outline: "2px solid var(--accent)",
        outlineOffset: -1,
    },
    templateCardHeader: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
    },
    templateCardBadges: {
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    builtinBadge: {
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: "0.6875rem",
        padding: "1px 6px",
        borderRadius: 4,
        background: "var(--bg-subtle, var(--bg-surface))",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
    },
    deleteBtn: {
        padding: 4,
        background: "none",
        border: "none",
        borderRadius: 4,
        color: "var(--text-muted)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
    },
    templateName: {
        fontWeight: 600,
        fontSize: "0.9375rem",
    },
    templateBadge: {
        fontSize: "0.75rem",
        padding: "2px 6px",
        borderRadius: 4,
        background: "var(--accent-muted, var(--bg-subtle))",
        color: "var(--text-muted)",
        whiteSpace: "nowrap",
    },
    templateDescription: {
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
        lineHeight: 1.4,
    },
    templateMeta: {
        fontSize: "0.75rem",
        color: "var(--text-muted)",
        marginTop: 2,
    },
};
