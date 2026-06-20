/**
 * Keyboard-shortcut cheatsheet page (Dialog->Pages migration C9) at
 * `/help/shortcuts`. Was ShortcutCheatsheet (a Ctrl+/ overlay); now a
 * deep-linkable reference page. Pure-static (reads APP_SHORTCUTS).
 */
import { PageLayout } from "../components/PageLayout";
import { useGoBack } from "../hooks/navigation/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { APP_SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import styles from "./ShortcutsPage.module.css";

export default function ShortcutsPage() {
  const { t } = useI18n();
  const goBack = useGoBack("/");

  const sections: Record<string, string> = {
    app: t("ui.shortcuts.section_app", "App"),
    editor: t("ui.shortcuts.section_editor", "Editor"),
  };

  const grouped = APP_SHORTCUTS.reduce<Record<string, typeof APP_SHORTCUTS>>(
    (acc, s) => {
      const section = s.section || "app";
      if (!acc[section]) acc[section] = [];
      acc[section].push(s);
      return acc;
    },
    {},
  );

  return (
    <PageLayout
      title={t("ui.shortcuts.title", "Tastenkombinationen")}
      testId="shortcuts-page"
      maxWidth="md"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      {Object.entries(grouped).map(([section, shortcuts]) => (
        <div key={section} className={styles.section}>
          <h3 className={styles.sectionTitle}>{sections[section] || section}</h3>
          <div className={styles.grid}>
            {shortcuts.map((s) => (
              <div key={s.keys} className={styles.row}>
                <kbd className={styles.kbd}>{formatKeys(s.keys)}</kbd>
                <span className={styles.label}>
                  {t(s.labelKey, s.labelFallback)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className={styles.hint}>
        {t(
          "ui.shortcuts.hint",
          "Tipp: Drücke Ctrl+/ um diese Übersicht jederzeit zu öffnen.",
        )}
      </div>
    </PageLayout>
  );
}

function formatKeys(keys: string): string {
  return keys
    .replace(/ctrl/gi, navigator.platform.includes("Mac") ? "⌘" : "Ctrl")
    .replace(/shift/gi, navigator.platform.includes("Mac") ? "⇧" : "Shift")
    .replace(/alt/gi, navigator.platform.includes("Mac") ? "⌥" : "Alt");
}
