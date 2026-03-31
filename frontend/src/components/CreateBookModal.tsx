import {useState} from "react";
import {BookCreate} from "../api/client";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import {ChevronDown} from "lucide-react";

interface Props {
    open: boolean;
    onClose: () => void;
    onCreate: (data: BookCreate) => void;
}

export default function CreateBookModal({open, onClose, onCreate}: Props) {
    const [title, setTitle] = useState("");
    const [author, setAuthor] = useState("");
    const [language, setLanguage] = useState("de");
    const [subtitle, setSubtitle] = useState("");
    const [series, setSeries] = useState("");
    const [seriesIndex, setSeriesIndex] = useState("");

    const handleSubmit = () => {
        if (!title.trim() || !author.trim()) return;
        onCreate({
            title: title.trim(),
            author: author.trim(),
            language,
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
                        <Dialog.Title className="dialog-title">Neues Buch</Dialog.Title>
                    </div>

                    <div style={styles.body}>
                        <div className="field">
                            <label className="label">Titel *</label>
                            <input
                                className="input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Der Titel deines Buches"
                                autoFocus
                            />
                        </div>

                        <div className="field">
                            <label className="label">Autor *</label>
                            <input
                                className="input"
                                value={author}
                                onChange={(e) => setAuthor(e.target.value)}
                                placeholder="Autorenname oder Pen Name"
                            />
                        </div>

                        <div className="field">
                            <label className="label">Untertitel</label>
                            <input
                                className="input"
                                value={subtitle}
                                onChange={(e) => setSubtitle(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>

                        <div style={styles.row}>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">Sprache</label>
                                <Select.Root value={language} onValueChange={setLanguage}>
                                    <Select.Trigger className="radix-select-trigger">
                                        <Select.Value/>
                                        <Select.Icon><ChevronDown size={14}/></Select.Icon>
                                    </Select.Trigger>
                                    <Select.Portal>
                                        <Select.Content className="radix-select-content" position="popper" sideOffset={4}>
                                            <Select.Viewport>
                                                {[
                                                    {value: "de", label: "Deutsch"},
                                                    {value: "en", label: "English"},
                                                    {value: "es", label: "Espanol"},
                                                    {value: "fr", label: "Francais"},
                                                    {value: "el", label: "Ellinika"},
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
                        </div>

                        <div style={styles.row}>
                            <div className="field" style={{flex: 2}}>
                                <label className="label">Reihe</label>
                                <input
                                    className="input"
                                    value={series}
                                    onChange={(e) => setSeries(e.target.value)}
                                    placeholder="z.B. Das unsterbliche Muster"
                                />
                            </div>
                            <div className="field" style={{flex: 1}}>
                                <label className="label">Band</label>
                                <input
                                    className="input"
                                    type="number"
                                    min="1"
                                    value={seriesIndex}
                                    onChange={(e) => setSeriesIndex(e.target.value)}
                                    placeholder="Nr."
                                />
                            </div>
                        </div>
                    </div>

                    <div className="dialog-footer">
                        <button className="btn btn-ghost" onClick={onClose}>
                            Abbrechen
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!title.trim() || !author.trim()}
                        >
                            Erstellen
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
