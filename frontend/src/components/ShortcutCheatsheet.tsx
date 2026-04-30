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
import styles from "./ShortcutCheatsheet.module.css"

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
        <Dialog.Overlay className={styles.overlay}/>
        <Dialog.Content className={styles.content}>
          <Dialog.Title className={styles.title}>
            <Keyboard size={18}/>
            {t("ui.shortcuts.title", "Tastenkombinationen")}
          </Dialog.Title>

          {Object.entries(grouped).map(([section, shortcuts]) => (
            <div key={section} className={styles.section}>
              <h3 className={styles.sectionTitle}>{sections[section] || section}</h3>
              <div className={styles.grid}>
                {shortcuts.map((s) => (
                  <div key={s.keys} className={styles.row}>
                    <kbd className={styles.kbd}>{formatKeys(s.keys)}</kbd>
                    <span className={styles.label}>{t(s.labelKey, s.labelFallback)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className={styles.hint}>
            {t("ui.shortcuts.hint", "Tipp: Drücke Ctrl+/ um diese Übersicht jederzeit zu öffnen.")}
          </div>

          <Dialog.Close asChild>
            <button className={styles.close} aria-label="Close"><X size={16}/></button>
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

