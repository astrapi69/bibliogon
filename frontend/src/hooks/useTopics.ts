import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Article topics from app settings (AR-02 Phase 2.1).
 *
 * Mirrors ``backend/config/app.yaml`` shape:
 *
 * ```yaml
 * topics:
 *   - "Tech"
 *   - "Writing"
 * ```
 *
 * Settings is the single source of truth; the ArticleEditor
 * topic dropdown reads from this hook. Empty strings are filtered;
 * non-string entries are dropped. Returns ``null`` while loading
 * or on API failure so callers can render an empty state.
 */
export function useTopics(): string[] | null {
    const [topics, setTopics] = useState<string[] | null>(null);
    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const raw = (config as Record<string, unknown>).topics;
                if (!Array.isArray(raw)) {
                    setTopics([]);
                    return;
                }
                const cleaned = (raw as unknown[])
                    .map((t) => (typeof t === "string" ? t.trim() : ""))
                    .filter((t) => t.length > 0);
                setTopics(cleaned);
            })
            .catch(() => {
                /* network failure leaves topics null */
            });
        return () => {
            cancelled = true;
        };
    }, []);
    return topics;
}
