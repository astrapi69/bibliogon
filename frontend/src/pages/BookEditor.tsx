import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, BookDetail, Chapter } from "../api/client";
import ChapterSidebar from "../components/ChapterSidebar";
import Editor from "../components/Editor";

export default function BookEditor() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeChapter = book?.chapters.find((c) => c.id === activeChapterId) ?? null;

  const loadBook = useCallback(async () => {
    if (!bookId) return;
    try {
      const data = await api.books.get(bookId);
      setBook(data);
      // Select first chapter if none active or active no longer exists
      if (data.chapters.length > 0) {
        setActiveChapterId((prev) => {
          if (prev && data.chapters.some((c) => c.id === prev)) return prev;
          return data.chapters[0].id;
        });
      } else {
        setActiveChapterId(null);
      }
    } catch (err) {
      console.error("Failed to load book:", err);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    loadBook();
  }, [loadBook]);

  const handleAddChapter = async () => {
    if (!bookId) return;
    const title = prompt("Kapiteltitel:");
    if (!title?.trim()) return;
    const chapter = await api.chapters.create(bookId, { title: title.trim() });
    setBook((prev) => {
      if (!prev) return prev;
      return { ...prev, chapters: [...prev.chapters, chapter] };
    });
    setActiveChapterId(chapter.id);
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!bookId) return;
    if (!confirm("Kapitel wirklich loeschen?")) return;
    await api.chapters.delete(bookId, chapterId);
    setBook((prev) => {
      if (!prev) return prev;
      const chapters = prev.chapters.filter((c) => c.id !== chapterId);
      return { ...prev, chapters };
    });
    if (activeChapterId === chapterId) {
      setActiveChapterId(book?.chapters.find((c) => c.id !== chapterId)?.id ?? null);
    }
  };

  const handleSaveContent = async (html: string) => {
    if (!bookId || !activeChapterId) return;
    try {
      const updated = await api.chapters.update(bookId, activeChapterId, {
        content: html,
      });
      setBook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updated.id ? updated : c
          ),
        };
      });
    } catch (err) {
      console.error("Autosave failed:", err);
    }
  };

  const handleExport = (fmt: "epub" | "pdf") => {
    if (!bookId) return;
    window.open(api.books.exportUrl(bookId, fmt), "_blank");
  };

  if (loading) {
    return (
      <div style={styles.loading}>
        <p>Laden...</p>
      </div>
    );
  }

  if (!book) {
    return (
      <div style={styles.loading}>
        <p>Buch nicht gefunden.</p>
      </div>
    );
  }

  return (
    <div style={styles.layout}>
      <ChapterSidebar
        bookTitle={book.title}
        chapters={book.chapters}
        activeChapterId={activeChapterId}
        onSelect={setActiveChapterId}
        onAdd={handleAddChapter}
        onDelete={handleDeleteChapter}
        onBack={() => navigate("/")}
        onExport={handleExport}
      />

      {activeChapter ? (
        <Editor
          key={activeChapter.id}
          content={activeChapter.content}
          onSave={handleSaveContent}
          placeholder={`Schreibe "${activeChapter.title}"...`}
        />
      ) : (
        <div style={styles.noChapter}>
          <p style={styles.noChapterText}>
            Erstelle ein Kapitel, um zu beginnen.
          </p>
          <button className="btn btn-primary" onClick={handleAddChapter}>
            Erstes Kapitel anlegen
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: "flex",
    height: "100vh",
    overflow: "hidden",
  },
  loading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    color: "var(--text-muted)",
  },
  noChapter: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  noChapterText: {
    color: "var(--text-muted)",
    fontFamily: "var(--font-display)",
    fontSize: "1.125rem",
  },
};
