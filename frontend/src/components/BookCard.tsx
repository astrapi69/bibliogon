import { useState, useEffect } from "react";
import { Book } from "../api/client";
import { useI18n } from "../hooks/useI18n";
import {
  Trash2,
  Clock,
  MoreVertical,
  AlertTriangle,
  Cloud,
} from "lucide-react";
import { isOfflineEnabled } from "../storage/connectivity";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import CoverPlaceholder from "./CoverPlaceholder";
import { formatLocaleDate } from "../utils/formatDate";
import { Badge } from "./Badge";
import { publicationStatusVariant } from "../utils/publicationStatusBadge";
import styles from "./BookCard.module.css";

interface Props {
  book: Book;
  onClick: () => void;
  onDelete: () => void;
  onDeletePermanent?: () => void;
}

export default function BookCard({
  book,
  onClick,
  onDelete,
  onDeletePermanent,
}: Props) {
  const { t, lang } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [offlineAvailable, setOfflineAvailable] = useState(false);
  const updated = formatLocaleDate(book.updated_at, lang);

  // Cloud badge for offline-available books (mobile-sync P3-C3). On the
  // normal desktop (offline disabled) this is an instant no-op — no
  // dynamic import, no IndexedDB access, no badge.
  useEffect(() => {
    if (!isOfflineEnabled()) return;
    let cancelled = false;
    void import("../storage/offline-download").then(async (mod) => {
      const is = await mod.isBookOffline(book.id);
      if (!cancelled) setOfflineAvailable(is);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Extract cover filename from path (e.g. "uploads/abc/cover/cover.png" -> "cover.png")
  const coverFilename = book.cover_image
    ? book.cover_image.split("/").pop()
    : null;
  const coverUrl = coverFilename
    ? `/api/books/${book.id}/assets/file/${coverFilename}`
    : null;

  return (
    <div
      className={`card card-interactive ${styles.card}`}
      data-testid={`book-card-${book.id}`}
      // View-agnostic id attribute — paired with the
      // ``data-book-id`` on BookListView's row so E2E specs
      // can target a book wrapper without knowing whether
      // grid or list view is active. See
      // VIEW-MODE-TESTID-PARITY-01.
      data-book-id={book.id}
      onClick={() => {
        if (!menuOpen) onClick();
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={`${book.title} cover`}
          className={styles.coverImage}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className={styles.coverImage}>
          <CoverPlaceholder
            title={book.title}
            subtitle={book.subtitle}
            data-testid={`book-card-placeholder-${book.id}`}
          />
        </div>
      )}
      <div className={styles.content}>
        <h3 className={styles.title}>
          {book.title}
          {offlineAvailable && (
            <Cloud
              size={14}
              data-testid={`book-card-offline-${book.id}`}
              aria-label={t("ui.offline.available", "Offline verfügbar")}
              style={{
                marginInlineStart: 6,
                verticalAlign: "middle",
                color: "var(--accent)",
              }}
            />
          )}
        </h3>
        {book.subtitle && <p className={styles.subtitle}>{book.subtitle}</p>}
        <p className={styles.author}>
          {book.author && book.author.trim()
            ? book.author
            : t("ui.dashboard.book_no_author", "—")}
        </p>
        {book.genre && (
          <span className={styles.genre}>
            {t(`ui.genres.${book.genre}`, book.genre)}
          </span>
        )}
        {book.series && (
          <p className={styles.series}>
            {book.series}
            {book.series_index != null ? ` - Band ${book.series_index}` : ""}
          </p>
        )}
        <div className={styles.footer}>
          {/* PUBLICATION-STATUS-BOOK-PARITY-01 (T0 C2):
           *  publication-lifecycle badge mirrors the
           *  Article card pattern (article-card-status-{id})
           *  + reuses the existing ``ui.articles.status_*``
           *  i18n keys — the labels are identical between
           *  the two surfaces. */}
          <Badge
            testId={`book-card-status-${book.id}`}
            variant={publicationStatusVariant(book.status ?? "draft")}
            size="sm"
          >
            {t(
              `ui.articles.status_${book.status ?? "draft"}`,
              book.status ?? "draft",
            )}
          </Badge>
          <span className={styles.date}>
            <Clock size={12} />
            {updated}
          </span>
          <span className={styles.lang}>{book.language.toUpperCase()}</span>
          <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                className="btn-icon"
                data-testid={`book-card-menu-${book.id}`}
                aria-label={t("ui.dashboard.book_actions", "Buchaktionen")}
                onClick={(e) => e.stopPropagation()}
                style={{ marginLeft: "auto" }}
              >
                <MoreVertical size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="hamburger-menu-content"
                align="end"
                sideOffset={4}
              >
                <DropdownMenu.Item
                  className="hamburger-menu-item"
                  data-testid={`book-card-menu-delete-${book.id}`}
                  onSelect={() => onDelete()}
                >
                  <Trash2 size={14} />{" "}
                  {t("ui.dashboard.move_to_trash", "In den Papierkorb")}
                </DropdownMenu.Item>
                {onDeletePermanent && (
                  <>
                    <DropdownMenu.Separator className="hamburger-menu-separator" />
                    <DropdownMenu.Item
                      className="hamburger-menu-item"
                      data-testid={`book-card-menu-delete-permanent-${book.id}`}
                      onSelect={() => onDeletePermanent()}
                      style={{ color: "var(--danger)" }}
                    >
                      <AlertTriangle size={14} />{" "}
                      {t("ui.dashboard.delete_permanent", "Endgültig löschen")}
                    </DropdownMenu.Item>
                  </>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </div>
  );
}
