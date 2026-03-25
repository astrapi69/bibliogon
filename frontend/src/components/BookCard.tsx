import { Book } from "../api/client";
import { Trash2, Clock } from "lucide-react";

interface Props {
  book: Book;
  onClick: () => void;
  onDelete: () => void;
}

export default function BookCard({ book, onClick, onDelete }: Props) {
  const updated = new Date(book.updated_at).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div style={styles.card} onClick={onClick}>
      <div style={styles.accent} />
      <div style={styles.content}>
        <h3 style={styles.title}>{book.title}</h3>
        {book.subtitle && <p style={styles.subtitle}>{book.subtitle}</p>}
        <p style={styles.author}>{book.author}</p>
        {book.series && (
          <p style={styles.series}>
            {book.series}
            {book.series_index != null ? ` - Band ${book.series_index}` : ""}
          </p>
        )}
        <div style={styles.footer}>
          <span style={styles.date}>
            <Clock size={12} />
            {updated}
          </span>
          <span style={styles.lang}>{book.language.toUpperCase()}</span>
          <button
            className="btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Buch loeschen"
          >
            <Trash2 size={14} color="var(--danger)" />
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "var(--bg-card)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-sm)",
    border: "1px solid var(--border)",
    cursor: "pointer",
    overflow: "hidden",
    transition: "all 180ms ease",
    display: "flex",
    flexDirection: "column",
  },
  accent: {
    height: 4,
    background: "var(--accent)",
  },
  content: {
    padding: "20px 20px 16px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: "1.25rem",
    fontWeight: 600,
    lineHeight: 1.3,
    marginBottom: 4,
  },
  subtitle: {
    color: "var(--text-secondary)",
    fontSize: "0.9375rem",
    marginBottom: 4,
  },
  author: {
    color: "var(--text-muted)",
    fontSize: "0.875rem",
    marginBottom: 8,
  },
  series: {
    fontSize: "0.8125rem",
    color: "var(--accent)",
    fontWeight: 500,
    marginBottom: 8,
  },
  footer: {
    marginTop: "auto",
    paddingTop: 12,
    borderTop: "1px solid var(--border)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: "0.8125rem",
    color: "var(--text-muted)",
  },
  date: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  lang: {
    fontSize: "0.6875rem",
    fontWeight: 600,
    background: "var(--bg-secondary)",
    padding: "2px 6px",
    borderRadius: 3,
    letterSpacing: "0.05em",
  },
};
