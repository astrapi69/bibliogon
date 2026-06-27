/**
 * Keyboard-shortcuts overview dialog (#662).
 *
 * Opened from anywhere via `Ctrl+/` or `?`. Lists every shortcut from the
 * central `APP_SHORTCUTS` registry, grouped by section, with a search field
 * and route-aware scoping: editor-section shortcuts only appear while an
 * editor route is active.
 *
 * The deep-linkable `/help/shortcuts` page renders the same registry; this
 * dialog is the quick keyboard-access surface.
 */
import { useEffect, useMemo, useState } from "react";
import { X, Search, Keyboard } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import { useI18n } from "../../hooks/useI18n";
import {
    APP_SHORTCUTS,
    formatShortcutKeys,
    type ShortcutRow,
} from "../../hooks/ui/useKeyboardShortcuts";

interface ShortcutsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** When false, editor-section shortcuts are hidden (non-editor routes). */
    editorScope: boolean;
}

const SECTION_ORDER: Array<ShortcutRow["section"]> = ["app", "editor"];

export default function ShortcutsDialog({
    open,
    onOpenChange,
    editorScope,
}: ShortcutsDialogProps) {
    const { t } = useI18n();
    const [query, setQuery] = useState("");

    // Reset the filter every time the dialog closes so the next open starts
    // from the full list.
    useEffect(() => {
        if (!open) setQuery("");
    }, [open]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return APP_SHORTCUTS.filter((shortcut) => {
            if (!editorScope && shortcut.section === "editor") return false;
            if (!q) return true;
            const label = t(shortcut.labelKey, shortcut.labelFallback).toLowerCase();
            const note = shortcut.noteKey
                ? t(shortcut.noteKey, shortcut.noteFallback ?? "").toLowerCase()
                : "";
            return (
                label.includes(q) ||
                shortcut.keys.toLowerCase().includes(q) ||
                note.includes(q)
            );
        });
    }, [query, editorScope, t]);

    const sectionTitles: Record<ShortcutRow["section"], string> = {
        app: t("ui.shortcuts.section_app", "App"),
        editor: t("ui.shortcuts.section_editor", "Editor"),
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="wide" data-testid="shortcuts-dialog">
                <DialogHeader>
                    <div className="flex items-center gap-2.5">
                        <Keyboard size={20} className="text-[var(--accent)]" />
                        <DialogTitle>
                            {t("ui.shortcuts.title", "Tastenkombinationen")}
                        </DialogTitle>
                    </div>
                    <DialogClose asChild>
                        <button
                            className="btn-icon"
                            aria-label={t("ui.common.close", "Schließen")}
                            data-testid="shortcuts-close"
                        >
                            <X size={16} />
                        </button>
                    </DialogClose>
                </DialogHeader>

                <DialogDescription className="sr-only">
                    {t(
                        "ui.shortcuts.hint",
                        "Tipp: Drücke Ctrl+/ um diese Übersicht jederzeit zu öffnen.",
                    )}
                </DialogDescription>

                <div className="relative mb-4">
                    <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    />
                    <input
                        type="text"
                        className="input pl-9"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t(
                            "ui.shortcuts.search_placeholder",
                            "Shortcuts durchsuchen…",
                        )}
                        aria-label={t(
                            "ui.shortcuts.search_placeholder",
                            "Shortcuts durchsuchen…",
                        )}
                        data-testid="shortcuts-search"
                        autoFocus
                    />
                </div>

                {visible.length === 0 ? (
                    <p
                        className="py-6 text-center text-sm text-[var(--text-muted)]"
                        data-testid="shortcuts-empty"
                    >
                        {t("ui.shortcuts.no_results", "Keine Tastenkürzel gefunden")}
                    </p>
                ) : (
                    SECTION_ORDER.map((section) => {
                        const rows = visible.filter((s) => s.section === section);
                        if (rows.length === 0) return null;
                        return (
                            <div key={section} className="mb-4">
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                    {sectionTitles[section]}
                                </h3>
                                <div className="flex flex-col gap-1.5">
                                    {rows.map((shortcut) => (
                                        <div
                                            key={shortcut.keys}
                                            className="flex items-center gap-3"
                                            data-testid={`shortcuts-row-${shortcut.keys}`}
                                        >
                                            <kbd className="inline-block min-w-[112px] rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-0.5 text-right font-[family-name:var(--font-mono)] text-xs text-[var(--text-primary)]">
                                                {formatShortcutKeys(shortcut.keys)}
                                            </kbd>
                                            <span className="text-[0.8125rem] text-[var(--text-secondary)]">
                                                {t(shortcut.labelKey, shortcut.labelFallback)}
                                            </span>
                                            {shortcut.noteKey ? (
                                                <span className="text-xs text-[var(--text-muted)]">
                                                    ({t(shortcut.noteKey, shortcut.noteFallback ?? "")})
                                                </span>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </DialogContent>
        </Dialog>
    );
}
