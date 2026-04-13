/**
 * Keyboard shortcut cheatsheet overlay.
 *
 * Shows all available shortcuts grouped by section.
 * Triggered by Ctrl+/ or from the help menu.
 */

import * as Dialog from "@radix-ui/react-dialog"
import {Keyboard, X} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import {APP_SHORTCUTS} from "../hooks/useKeyboardShortcuts"

interface Props {
  open: boolean
  onClose: () => void
}

export default function ShortcutCheatsheet({open, onClose}: Props) {
  const {t} = useI18n()

  const sections: Record<string, string> = {
    app: t("ui.shortcuts.section_app", "App"),
    editor: t("ui.shortcuts.section_editor", "Editor"),
  }

  const grouped = APP_SHORTCUTS.reduce<Record<string, typeof APP_SHORTCUTS>>((acc, s) => {
    const section = s.section || "app"
    if (!acc[section]) acc[section] = []
    acc[section].push(s)
    return acc
  }, {})

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay style={styles.overlay}/>
        <Dialog.Content style={styles.content}>
          <Dialog.Title style={styles.title}>
            <Keyboard size={18}/>
            {t("ui.shortcuts.title", "Tastenkombinationen")}
          </Dialog.Title>

          {Object.entries(grouped).map(([section, shortcuts]) => (
            <div key={section} style={{marginBottom: 16}}>
              <h3 style={styles.sectionTitle}>{sections[section] || section}</h3>
              <div style={styles.grid}>
                {shortcuts.map((s) => (
                  <div key={s.keys} style={styles.row}>
                    <kbd style={styles.kbd}>{formatKeys(s.keys)}</kbd>
                    <span style={styles.label}>{t(s.labelKey, s.labelFallback)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={styles.hint}>
            {t("ui.shortcuts.hint", "Tipp: Druecke Ctrl+/ um diese Uebersicht jederzeit zu oeffnen.")}
          </div>

          <Dialog.Close asChild>
            <button style={styles.close} aria-label="Close"><X size={16}/></button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function formatKeys(keys: string): string {
  return keys
    .replace(/ctrl/gi, navigator.platform.includes("Mac") ? "\u2318" : "Ctrl")
    .replace(/shift/gi, navigator.platform.includes("Mac") ? "\u21E7" : "Shift")
    .replace(/alt/gi, navigator.platform.includes("Mac") ? "\u2325" : "Alt")
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.4)", zIndex: 9998,
  },
  content: {
    position: "fixed", top: "50%", left: "50%",
    transform: "translate(-50%, -50%)",
    background: "var(--bg-card)", borderRadius: "var(--radius-lg, 12px)",
    padding: 24, width: "min(520px, 90vw)", maxHeight: "80vh", overflowY: "auto",
    boxShadow: "var(--shadow-lg)", zIndex: 9999,
  },
  title: {
    display: "flex", alignItems: "center", gap: 8,
    fontSize: "1.125rem", fontWeight: 600, margin: 0, marginBottom: 20,
    color: "var(--text-primary)",
  },
  sectionTitle: {
    fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" as const,
    letterSpacing: "0.05em", color: "var(--text-muted)",
    marginBottom: 8,
  },
  grid: {
    display: "flex", flexDirection: "column" as const, gap: 6,
  },
  row: {
    display: "flex", alignItems: "center", gap: 12,
  },
  kbd: {
    display: "inline-block", minWidth: 100, textAlign: "right" as const,
    padding: "2px 8px", fontSize: "0.75rem", fontFamily: "var(--font-mono)",
    background: "var(--bg-surface, var(--bg-primary))",
    border: "1px solid var(--border)", borderRadius: 4,
    color: "var(--text-primary)",
  },
  label: {
    fontSize: "0.8125rem", color: "var(--text-secondary, var(--text-primary))",
  },
  hint: {
    marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--border)",
    fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" as const,
  },
  close: {
    position: "absolute" as const, top: 12, right: 12,
    background: "none", border: "none", cursor: "pointer",
    color: "var(--text-muted)", padding: 4,
  },
}
