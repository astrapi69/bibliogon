import { useState } from "react";
import { BookCreate } from "../api/client";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onCreate: (data: BookCreate) => void;
}

export default function CreateBookModal({ onClose, onCreate }: Props) {
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
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.heading}>Neues Buch</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
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
            <div className="field" style={{ flex: 1 }}>
              <label className="label">Sprache</label>
              <select
                className="input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="de">Deutsch</option>
                <option value="en">English</option>
                <option value="es">Espanol</option>
                <option value="fr">Francais</option>
                <option value="el">Ellinika</option>
              </select>
            </div>
          </div>

          <div style={styles.row}>
            <div className="field" style={{ flex: 2 }}>
              <label className="label">Reihe</label>
              <input
                className="input"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                placeholder="z.B. Das unsterbliche Muster"
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
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

        <div style={styles.footer}>
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(28, 25, 23, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    backdropFilter: "blur(2px)",
  },
  modal: {
    background: "var(--bg-card)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-lg)",
    width: "100%",
    maxWidth: 520,
    maxHeight: "90vh",
    overflow: "auto",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px 0",
  },
  heading: {
    fontFamily: "var(--font-display)",
    fontSize: "1.375rem",
    fontWeight: 600,
  },
  body: {
    padding: "20px 24px",
  },
  row: {
    display: "flex",
    gap: 12,
  },
  footer: {
    padding: "12px 24px 20px",
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
};
