/**
 * Central keyboard shortcut registry.
 *
 * Registers global shortcuts that work across the entire app.
 * Editor-specific shortcuts (bold, italic, etc.) are handled by TipTap
 * and are NOT duplicated here.
 *
 * Usage:
 *   useKeyboardShortcuts(shortcuts)
 *
 * Where shortcuts is an array of {keys, handler, when?} objects.
 * `when` is an optional guard that must return true for the shortcut to fire.
 */

import {useEffect, useRef} from "react"

export interface Shortcut {
  /** Key combo, e.g. "ctrl+h", "ctrl+/", "?" */
  keys: string
  /** Handler to call when the shortcut is triggered */
  handler: () => void
  /** Optional guard: only fire when this returns true */
  when?: () => boolean
  /** Description for the cheatsheet (i18n key or fallback) */
  label?: string
}

function matchesCombo(event: KeyboardEvent, keys: string): boolean {
  const parts = keys.toLowerCase().split("+").map((p) => p.trim())
  const needCtrl = parts.includes("ctrl") || parts.includes("mod")
  const needShift = parts.includes("shift")
  const needAlt = parts.includes("alt")

  const key = parts.filter((p) => !["ctrl", "mod", "shift", "alt"].includes(p))[0]
  if (!key) return false

  const ctrlOrMeta = event.ctrlKey || event.metaKey
  const eventKey = event.key.toLowerCase()

  // "?" inherently requires Shift on most layouts, so the physical event
  // carries shiftKey=true even though the combo has no explicit "shift".
  // Enforcing the Shift comparison (needShift=false vs event.shiftKey=true)
  // would reject every "?" press, so match the produced character directly
  // and only guard the other modifiers.
  if (key === "?") return eventKey === "?" && !ctrlOrMeta && !event.altKey

  if (needCtrl !== ctrlOrMeta) return false
  if (needShift !== event.shiftKey) return false
  if (needAlt !== event.altKey) return false

  if (key === "/") return eventKey === "/" || event.code === "Slash"
  return eventKey === key
}

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement
  if (!target) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]): void {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        if (!matchesCombo(event, shortcut.keys)) continue
        if (shortcut.when && !shortcut.when()) continue

        // For single-key shortcuts (like "?"), skip when in editable fields
        const hasMod = shortcut.keys.toLowerCase().includes("ctrl") ||
                       shortcut.keys.toLowerCase().includes("mod") ||
                       shortcut.keys.toLowerCase().includes("alt")
        if (!hasMod && isEditableTarget(event)) continue

        event.preventDefault()
        shortcut.handler()
        return
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])
}

/** A single row in the shortcut cheatsheet / overview dialog. */
export interface ShortcutRow {
  keys: string
  labelKey: string
  labelFallback: string
  section: "app" | "editor"
  /** Optional muted reminder shown next to the label (i18n key). */
  noteKey?: string
  noteFallback?: string
}

/** All app-level shortcuts for display in the cheatsheet + overview dialog. */
export const APP_SHORTCUTS: ShortcutRow[] = [
  // App navigation
  {keys: "Ctrl+/", labelKey: "ui.shortcuts.show_shortcuts", labelFallback: "Shortcuts anzeigen", section: "app"},
  {
    keys: "Ctrl+S",
    labelKey: "ui.shortcuts.save",
    labelFallback: "Speichern",
    section: "app",
    noteKey: "ui.shortcuts.save_note",
    noteFallback: "Auto-Speichern ist aktiv",
  },
  {keys: "Alt+Z", labelKey: "ui.shortcuts.toggle_word_wrap", labelFallback: "Zeilenumbruch umschalten", section: "app"},
  {keys: "Ctrl+Shift+F", labelKey: "ui.shortcuts.fullscreen", labelFallback: "Vollbild umschalten", section: "app"},
  {keys: "Ctrl+Shift+D", labelKey: "ui.shortcuts.composition_mode", labelFallback: "Kompositionsmodus", section: "app"},
  {keys: "Esc", labelKey: "ui.shortcuts.exit", labelFallback: "Schließen / Verlassen", section: "app"},
  {keys: "Ctrl+H", labelKey: "ui.shortcuts.search_replace", labelFallback: "Suchen & Ersetzen", section: "editor"},
  // Editor formatting (from TipTap, listed for reference)
  {keys: "Ctrl+B", labelKey: "ui.shortcuts.bold", labelFallback: "Fett", section: "editor"},
  {keys: "Ctrl+I", labelKey: "ui.shortcuts.italic", labelFallback: "Kursiv", section: "editor"},
  {keys: "Ctrl+U", labelKey: "ui.shortcuts.underline", labelFallback: "Unterstrichen", section: "editor"},
  {keys: "Ctrl+Shift+X", labelKey: "ui.shortcuts.strikethrough", labelFallback: "Durchgestrichen", section: "editor"},
  {keys: "Ctrl+E", labelKey: "ui.shortcuts.code", labelFallback: "Inline-Code", section: "editor"},
  {keys: "Ctrl+Shift+1", labelKey: "ui.shortcuts.heading1", labelFallback: "Überschrift 1", section: "editor"},
  {keys: "Ctrl+Shift+2", labelKey: "ui.shortcuts.heading2", labelFallback: "Überschrift 2", section: "editor"},
  {keys: "Ctrl+Shift+3", labelKey: "ui.shortcuts.heading3", labelFallback: "Überschrift 3", section: "editor"},
  {keys: "Ctrl+Shift+8", labelKey: "ui.shortcuts.bullet_list", labelFallback: "Aufzählung", section: "editor"},
  {keys: "Ctrl+Shift+9", labelKey: "ui.shortcuts.ordered_list", labelFallback: "Nummerierte Liste", section: "editor"},
  {keys: "Ctrl+Shift+B", labelKey: "ui.shortcuts.blockquote", labelFallback: "Zitat", section: "editor"},
  {keys: "Ctrl+Z", labelKey: "ui.shortcuts.undo", labelFallback: "Rückgängig", section: "editor"},
  {keys: "Ctrl+Y", labelKey: "ui.shortcuts.redo", labelFallback: "Wiederherstellen", section: "editor"},
  {keys: "Ctrl+Shift+Z", labelKey: "ui.shortcuts.redo", labelFallback: "Wiederherstellen", section: "editor"},
]

/**
 * Render a key combo with platform-appropriate modifier glyphs
 * (⌘/⇧/⌥ on macOS, Ctrl/Shift/Alt elsewhere). Shared by the
 * /help/shortcuts page and the shortcuts overview dialog.
 *
 * @example
 *   formatShortcutKeys("Ctrl+Shift+F") // "Ctrl+Shift+F" (or "⌘+⇧+F" on Mac)
 */
export function formatShortcutKeys(keys: string): string {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac")
  return keys
    .replace(/ctrl/gi, isMac ? "⌘" : "Ctrl")
    .replace(/shift/gi, isMac ? "⇧" : "Shift")
    .replace(/alt/gi, isMac ? "⌥" : "Alt")
}
