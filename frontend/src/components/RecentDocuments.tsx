/**
 * "Recently edited" quick-access strip for the dashboards (#314).
 *
 * Renders the most recently updated books (BD) or articles (AD) as compact
 * chips — type icon + title + relative time — that deep-link to the editor.
 * Reads via {@link useRecentDocuments} (storage seam; online + offline) and
 * localizes the timestamp with {@link formatRelativeTime}. Chips wrap onto
 * the next line on narrow viewports (no horizontal scrollbar, even with a
 * single item). Renders nothing when there are no entries.
 */

import { useNavigate } from "react-router-dom";
import { BookOpen, FileText } from "lucide-react";

import { useI18n } from "../hooks/useI18n";
import { useRecentDocuments } from "../hooks/useRecentDocuments";
import { formatRelativeTime } from "../lib/utils/relativeTime";

interface RecentDocumentsProps {
  kind: "books" | "articles";
  limit?: number;
  /** Bump to force a refresh (e.g. after a list reload). */
  reloadKey?: unknown;
}

export default function RecentDocuments({
  kind,
  limit = 5,
  reloadKey,
}: RecentDocumentsProps) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const items = useRecentDocuments(kind, limit, reloadKey);

  if (items.length === 0) return null;

  return (
    <section className="mb-4" data-testid="recent-documents">
      <h2
        className="mb-1 text-xs font-semibold"
        style={{ color: "var(--text-muted)" }}
      >
        {t("ui.dashboard.recent", "Zuletzt bearbeitet")}
      </h2>
      <div className="flex flex-wrap gap-2 pb-1">
        {items.map((doc) => {
          const Icon = doc.kind === "book" ? BookOpen : FileText;
          const href =
            doc.kind === "book" ? `/book/${doc.id}` : `/articles/${doc.id}`;
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => navigate(href)}
              className="card card-interactive flex min-h-[44px] max-w-[220px] shrink-0 items-center gap-2 px-3 py-2 text-left"
              data-testid={`recent-doc-${doc.id}`}
            >
              <Icon size={16} aria-hidden style={{ flexShrink: 0 }} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">
                  {doc.title || t("ui.common.untitled", "Ohne Titel")}
                </span>
                {doc.updatedAt && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatRelativeTime(new Date(doc.updatedAt), { locale: lang })}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
