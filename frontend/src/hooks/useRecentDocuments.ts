/**
 * Recently-edited books or articles for the dashboard quick-access strip
 * (#314).
 *
 * Reads the list through the `getStorage()` seam (so it works online and
 * offline), sorts by `updated_at` descending, and returns the most recent
 * `limit` entries. Re-fetches when `kind` / `limit` change; callers can pass a
 * `reloadKey` that, when changed, forces a refresh (e.g. after a save).
 */

import { useEffect, useState } from "react";

import { getStorage } from "../storage";

export interface RecentDocument {
  id: string;
  title: string;
  kind: "book" | "article";
  /** ISO timestamp of the last edit. */
  updatedAt: string;
}

export function useRecentDocuments(
  kind: "books" | "articles",
  limit = 5,
  reloadKey?: unknown,
): RecentDocument[] {
  const [items, setItems] = useState<RecentDocument[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const storage = getStorage();
        const docKind = kind === "books" ? "book" : "article";
        const rows =
          kind === "books"
            ? await storage.books.list()
            : await storage.articles.list();
        const recent: RecentDocument[] = rows
          .map((row) => ({
            id: row.id,
            title: row.title,
            kind: docKind as RecentDocument["kind"],
            updatedAt: row.updated_at ?? "",
          }))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit);
        if (!cancelled) setItems(recent);
      } catch {
        if (!cancelled) setItems([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, limit, reloadKey]);

  return items;
}
