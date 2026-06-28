/**
 * "Aus Vorlage" tab body for CreateBookForm: the template card list
 * (loading / empty / populated states) with select + delete affordances.
 * Extracted from CreateBookForm.tsx (#677); data-testids unchanged.
 */

import * as Tabs from "@radix-ui/react-tabs";
import { Lock, Trash2 } from "lucide-react";
import { BookTemplate, BookType } from "../../../api/client";
import styles from "../../CreateBookForm.module.css";
import { slugifyTemplateName } from "./slugifyTemplateName";

type T = (key: string, fallback: string) => string;

export function TemplatePickerTab({
  t,
  bookType,
  templates,
  templatesError,
  selectedTemplateId,
  onSelect,
  onDelete,
}: {
  t: T;
  bookType: BookType;
  templates: BookTemplate[] | null;
  templatesError: string | null;
  selectedTemplateId: string | null;
  onSelect: (id: string) => void;
  onDelete: (tpl: BookTemplate) => void;
}) {
  return (
    <Tabs.Content value="template">
      <div className={styles.templatePickerHeader}>
        <div className="label">
          {t("ui.create_book.template_picker_title", "Wähle eine Vorlage")}
        </div>
      </div>
      {templates === null && (
        <div className={styles.templatesEmpty}>
          {t("ui.create_book.template_loading", "Lade Vorlagen...")}
        </div>
      )}
      {templates !== null && templates.length === 0 && (
        <div className={styles.templatesEmpty}>
          {templatesError
            ? t(
                "ui.create_book.template_load_error",
                "Vorlagen konnten nicht geladen werden",
              )
            : t("ui.create_book.template_empty", "Keine Vorlagen verfügbar")}
        </div>
      )}
      {templates !== null && templates.length > 0 && (
        <div className={styles.templateList} role="radiogroup">
          {templates.map((tpl) => {
            const selected = tpl.id === selectedTemplateId;
            const genreLabel = t(`ui.template_genres.${tpl.genre}`, tpl.genre);
            const select = () => onSelect(tpl.id);
            return (
              <div
                key={tpl.id}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                data-testid={`template-card-${tpl.id}`}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    select();
                  }
                }}
                className={`${styles.templateCard} ${selected ? styles.templateCardSelected : ""}`}
              >
                <div className={styles.templateCardHeader}>
                  <span className={styles.templateName}>
                    {tpl.is_builtin
                      ? t(
                          `ui.builtin_templates.${slugifyTemplateName(tpl.name)}.name`,
                          tpl.name,
                        )
                      : tpl.name}
                  </span>
                  <div className={styles.templateCardBadges}>
                    <span className={styles.templateBadge}>{genreLabel}</span>
                    {tpl.is_builtin ? (
                      <span
                        className={styles.builtinBadge}
                        title={t(
                          "ui.template_picker.builtin_hint",
                          "Mitgelieferte Vorlage",
                        )}
                        data-testid={`template-builtin-badge-${tpl.id}`}
                      >
                        <Lock size={10} />
                        {t("ui.template_picker.builtin", "Mitgeliefert")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={`btn-icon ${styles.deleteBtn}`}
                        aria-label={t("ui.template_picker.delete", "Löschen")}
                        data-testid={`template-delete-${tpl.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(tpl);
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.templateDescription}>
                  {tpl.is_builtin
                    ? t(
                        `ui.builtin_templates.${slugifyTemplateName(tpl.name)}.description`,
                        tpl.description,
                      )
                    : tpl.description}
                </div>
                <div className={styles.templateMeta}>
                  {bookType === "prose"
                    ? t(
                        "ui.create_book.template_chapter_count",
                        "{count} Kapitel",
                      ).replace("{count}", String(tpl.chapters.length))
                    : t("ui.book_templates.page_count", "{count} Seiten").replace(
                        "{count}",
                        String(tpl.chapters.length),
                      )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Tabs.Content>
  );
}
