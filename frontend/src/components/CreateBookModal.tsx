import {useState, useEffect} from "react";
import {api, BookCreate} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import {ChevronDown} from "lucide-react";

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (data: BookCreate) => void;
}

export default function CreateBookModal({open, onClose, onCreate}: Props) {
    const {t} = useI18n();
    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [authorChoices, setAuthorChoices] = useState<string[]>([]);
    const [language, setLanguage] = useState("de");
    const [genre, setGenre] = useState("");
    const [subtitle, setSubtitle] = useState("");
    const [series, setSeries] = useState("");
    const [seriesIndex, setSeriesIndex] = useState("");

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

    const handleSubmit = () => {
        if (!title.trim() || !author.trim()) return;
        onCreate({
            title: title.trim(),
            author: author.trim(),
            language,
            genre: genre.trim() || undefined,
            subtitle: subtitle.trim() || undefined,
            series: series.trim() || undefined,
            series_index: seriesIndex ? parseInt(seriesIndex, 10) : undefined,
        });
        // Reset form
        setTitle("");
        setAuthor("");
        setLanguage("de");
        setSubtitle("");
        setSeries("");
        setSeriesIndex("");
    };

    return (
        <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay"/>
                <Dialog.Content className="dialog-content dialog-content-wide">
                    <div className="dialog-header">
                        <Dialog.Title className="dialog-title">{t("ui.create_book.title", "Neues Buch")}</Dialog.Title>
                    </div>

                    <div style={styles.body}>
                        <div className="field">
                            <label className="label">{t("ui.create_book.book_title", "Titel")} *</label>
                            <input
                                className="input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder={t("ui.create_book.book_title_placeholder", "Der Titel deines Buches")}
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
                                />
                            )}
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

                        <div style={styles.row}>
                            <div className="field" style={{flex: 1}}>
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
                            <div className="field" style={{flex: 1}}>
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
                        </div>

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
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={onClose}>
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!title.trim() || !author.trim()}
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
};
