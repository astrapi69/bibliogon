import { useState, useEffect, useMemo } from "react";
import {
  api,
  ApiError,
  Author,
  BookCreate,
  BookFromTemplateCreate,
  BookTemplate,
  BookType,
} from "../api/client";
import { getStorage } from "../storage";
import { useBookTypes } from "../hooks/useBookTypes";
import { useI18n } from "../hooks/useI18n";
import { useDialog } from "./AppDialog";
import { notify } from "../utils/notify";
import { EnhancedTextarea } from "./textarea/EnhancedTextarea";
import AuthorSelectInput from "./AuthorSelectInput";
import * as Collapsible from "@radix-ui/react-collapsible";
import * as Select from "@radix-ui/react-select";
import * as Tabs from "@radix-ui/react-tabs";
import { ChevronDown, ChevronRight, Lock, Trash2 } from "lucide-react";
import styles from "./CreateBookForm.module.css";

type Mode = "blank" | "template";

/** TPL-I18N-01: derive an i18n key suffix from a builtin template's
 *  English name. Stable across languages because the key is built
 *  from the canonical (English) name stored in the DB. Lowercase +
 *  ASCII alphanum + underscore so YAML keys stay simple.
 *
 *  ``Children's Picture Book`` -> ``childrens_picture_book``
 *  ``Sci-Fi Novel``           -> ``sci_fi_novel``
 *  ``Non-Fiction / How-To``   -> ``non_fiction_how_to``
 */
function slugifyTemplateName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

interface Props {
  /** Called with the blank-mode payload when the user submits. */
  onCreate: (data: BookCreate) => void;
  /** Called with the template-mode payload. Omit to hide template mode. */
  onCreateFromTemplate?: (data: BookFromTemplateCreate) => void;
  /** Cancel/back affordance (the page wires this to useGoBack). */
  onCancel: () => void;
  /** When "picture_book"/"comic_book", the form submits with book_type
   *  set and hides the Template tab (driven by the registry's
   *  capabilities.template_catalog flag). Defaults to "prose". */
  bookType?: BookType;
}

/**
 * Book-creation form body, extracted from the former CreateBookModal as
 * part of the Dialog->Pages migration (C2). Callback-based and chrome-
 * free: the page (CreateBookPage) supplies the PageLayout shell, the
 * per-type title, and the create/navigate handlers. Carries all the
 * field logic (required validation, collapsible optional fields, genre
 * key mapping, template picker, Authors-DB integration) unchanged from
 * the modal.
 */
export default function CreateBookForm({
  onCreate,
  onCreateFromTemplate,
  onCancel,
  bookType = "prose",
}: Props) {
  const { t } = useI18n();
  const dialog = useDialog();
  // BOOK-TYPES-SSOT-YAML-01 C6: query the registry for this book type's
  // capabilities. template_catalog drives the template-tab visibility.
  const bookTypesSnapshot = useBookTypes();
  const supportsTemplateCatalog =
    bookTypesSnapshot.types[bookType]?.capabilities.template_catalog ?? false;
  const GENRE_KEYS = [
    "novel",
    "non_fiction",
    "technical",
    "children",
    "biography",
    "poetry",
    "short_stories",
    "academic",
    "textbook",
    "self_help",
    "fantasy",
    "thriller",
    "romance",
    "cookbook",
    "travel",
  ];

  // Mode (Blank vs. From template)
  const [mode, setMode] = useState<Mode>("blank");

  // Stage 1: Required
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [authorChoices, setAuthorChoices] = useState<string[]>([]);
  // Authors-DB integration (mirrors ConvertToBookWizard's Bug 8 Phase 2
  // pattern). globalAuthors powers the datalist alongside authorChoices;
  // addToAuthorsDb checkbox creates the typed name in the global DB
  // before the book POST (non-blocking — defensive pattern, book create
  // still proceeds on author-create failure).
  const [globalAuthors, setGlobalAuthors] = useState<Author[]>([]);
  const [addToAuthorsDb, setAddToAuthorsDb] = useState(true);
  // Stage 2: Optional (collapsed by default)
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [genre, setGenre] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [language, setLanguage] = useState("de");
  const [description, setDescription] = useState("");
  const [isSeries, setIsSeries] = useState(false);
  const [series, setSeries] = useState("");
  const [seriesIndex, setSeriesIndex] = useState("");

  // Template state
  const [templates, setTemplates] = useState<BookTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null,
  );

  const handleDeleteTemplate = async (tpl: BookTemplate) => {
    if (tpl.is_builtin) return;
    const ok = await dialog.confirm(
      t("ui.template_picker.delete_title", "Vorlage löschen"),
      t(
        "ui.template_picker.delete_confirm",
        "Vorlage '{name}' wirklich löschen? Dies kann nicht rückgaengig gemacht werden.",
      ).replace("{name}", tpl.name),
      "danger",
    );
    if (!ok) return;
    try {
      await api.templates.delete(tpl.id);
      setTemplates((prev) =>
        prev ? prev.filter((t) => t.id !== tpl.id) : prev,
      );
      if (selectedTemplateId === tpl.id) setSelectedTemplateId(null);
      notify.success(t("ui.template_picker.deleted", "Vorlage gelöscht"));
    } catch (err) {
      notify.error(
        err instanceof ApiError
          ? err.detail
          : t("ui.template_picker.delete_failed", "Löschen fehlgeschlagen"),
      );
    }
  };

  // Load author profile on mount
  useEffect(() => {
    api.settings
      .getApp()
      .then((config) => {
        const authorConfig = (config.author || {}) as Record<string, unknown>;
        const realName = (authorConfig.name as string) || "";
        const penNames = Array.isArray(authorConfig.pen_names)
          ? (authorConfig.pen_names as string[]).filter(Boolean)
          : [];
        const choices = realName ? [realName, ...penNames] : penNames;
        setAuthorChoices(choices);
        if (!author && realName) {
          setAuthor(realName);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load global Authors-Database snapshot on mount. Powers the author-
  // field datalist alongside authorChoices. Non-blocking; silent
  // fallback on fetch error.
  useEffect(() => {
    let cancelled = false;
    getStorage().authors
      .list({})
      .then((rows) => {
        if (!cancelled) setGlobalAuthors(rows);
      })
      .catch(() => {
        /* non-critical; datalist degrades to authorChoices only */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Union of authorChoices + globalAuthors.name, deduped + ordered
  // (user-identity choices first). Powers the <datalist> below.
  const authorSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of authorChoices) {
      const trimmed = c.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    for (const a of globalAuthors) {
      const trimmed = a.name.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    }
    return out;
  }, [authorChoices, globalAuthors]);

  // True when the typed author matches an existing Authors-DB entry
  // (trim + case-insensitive). Controls the "Add to Authors-Database"
  // checkbox visibility: hidden when the entry already exists.
  const authorAlreadyInDb = useMemo(() => {
    const trimmed = author.trim().toLowerCase();
    if (!trimmed) return true;
    return globalAuthors.some((a) => a.name.trim().toLowerCase() === trimmed);
  }, [author, globalAuthors]);
  const showAddToAuthorsCheckbox = !authorAlreadyInDb;

  // Fetch templates the first time the user switches into template mode
  useEffect(() => {
    if (mode !== "template" || templates !== null) return;
    api.templates
      .list()
      .then((list) => {
        setTemplates(list);
        setTemplatesError(null);
      })
      .catch((err) => {
        setTemplates([]);
        setTemplatesError(String(err?.message || err));
      });
  }, [mode, templates]);

  // When a template is picked, pre-fill language + description from it
  useEffect(() => {
    if (!selectedTemplateId || !templates) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    setLanguage(tpl.language);
    setDescription(tpl.description);
  }, [selectedTemplateId, templates]);

  const resetForm = () => {
    setTitle("");
    setAuthor("");
    setGenre("");
    setLanguage("de");
    setDescription("");
    setSubtitle("");
    setIsSeries(false);
    setSeries("");
    setSeriesIndex("");
    setDetailsOpen(false);
    setSelectedTemplateId(null);
    setMode("blank");
  };

  const handleSubmit = async () => {
    if (!title.trim() || !author.trim()) return;

    // Map translated genre back to key (e.g. "Roman" -> "novel")
    let genreValue = genre.trim();
    if (genreValue) {
      const matchedKey = GENRE_KEYS.find(
        (k) =>
          t(`ui.genres.${k}`, k).toLowerCase() === genreValue.toLowerCase(),
      );
      if (matchedKey) genreValue = matchedKey;
    }

    // Optionally create the typed author in the global Authors-Database
    // BEFORE the book create. Non-blocking: a failed author POST surfaces
    // an error toast but the book create still proceeds with the free-
    // text author. Defensive pattern mirrors ConvertToBookWizard.
    if (showAddToAuthorsCheckbox && addToAuthorsDb && author.trim()) {
      try {
        const created = await getStorage().authors.create({
          name: author.trim(),
        });
        setGlobalAuthors((prev) => [...prev, created]);
      } catch (err) {
        const detail =
          err instanceof ApiError
            ? err.detail
            : t(
                "ui.create_book.add_to_authors_error",
                "Autor konnte nicht zur Datenbank hinzugefügt werden.",
              );
        notify.error(detail, err);
        // Continue to book create regardless — fail-soft.
      }
    }

    if (mode === "template") {
      if (!selectedTemplateId || !onCreateFromTemplate) return;
      onCreateFromTemplate({
        template_id: selectedTemplateId,
        title: title.trim(),
        author: author.trim(),
        language,
        genre: genreValue || undefined,
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        series: series.trim() || undefined,
        series_index: seriesIndex ? parseInt(seriesIndex, 10) : undefined,
      });
    } else {
      onCreate({
        title: title.trim(),
        author: author.trim(),
        language,
        genre: genreValue || undefined,
        subtitle: subtitle.trim() || undefined,
        description: description.trim() || undefined,
        series: series.trim() || undefined,
        series_index: seriesIndex ? parseInt(seriesIndex, 10) : undefined,
        // Only thread book_type through when the caller asked for a
        // non-default type; keeps the API payload clean for prose.
        ...(bookType !== "prose" ? { book_type: bookType } : {}),
      });
    }
    resetForm();
  };

  const canSubmit =
    !!title.trim() &&
    !!author.trim() &&
    (mode === "blank" || !!selectedTemplateId);

  return (
    <div>
      <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)}>
        {/* BOOK-TYPES-SSOT-YAML-01 C6: tab visibility driven by
         *  capabilities.template_catalog flag in book-types.yaml. */}
        {supportsTemplateCatalog && (
          <Tabs.List className="radix-tabs-list" style={{ marginBottom: 12 }}>
            <Tabs.Trigger
              value="blank"
              className="radix-tab-trigger"
              data-testid="create-book-mode-blank"
            >
              {t("ui.create_book.mode_blank", "Leer")}
            </Tabs.Trigger>
            <Tabs.Trigger
              value="template"
              className="radix-tab-trigger"
              data-testid="create-book-mode-template"
            >
              {t("ui.create_book.mode_template", "Aus Vorlage")}
            </Tabs.Trigger>
          </Tabs.List>
        )}

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
                const genreLabel = t(
                  `ui.template_genres.${tpl.genre}`,
                  tpl.genre,
                );
                const select = () => setSelectedTemplateId(tpl.id);
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
                        <span className={styles.templateBadge}>
                          {genreLabel}
                        </span>
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
                              handleDeleteTemplate(tpl);
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
                      {t(
                        "ui.create_book.template_chapter_count",
                        "{count} Kapitel",
                      ).replace("{count}", String(tpl.chapters.length))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tabs.Content>

        <Tabs.Content value="blank">
          {/* Blank mode has no extra content above the shared fields */}
        </Tabs.Content>
      </Tabs.Root>

      <div className={styles.body}>
        {/* === Stage 1: Required fields only === */}
        <div className="field">
          <label className="label">
            {t("ui.create_book.book_title", "Titel")} *
          </label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t(
              "ui.create_book.book_title_placeholder",
              "Der Titel deines Buches",
            )}
            data-testid="create-book-title"
            autoFocus
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="create-book-author">
            {t("ui.create_book.author", "Autor")} *
          </label>
          {/* RECURRING-COMPONENT-AUDIT-01 #4 extraction: unified input +
              datalist + Add-to-Authors-DB checkbox lives in
              AuthorSelectInput. */}
          <AuthorSelectInput
            value={author}
            onChange={setAuthor}
            suggestions={authorSuggestions}
            showAddToAuthorsCheckbox={showAddToAuthorsCheckbox}
            addToAuthorsDb={addToAuthorsDb}
            onAddToAuthorsDbChange={setAddToAuthorsDb}
            testidPrefix="create-book"
            placeholder={t(
              "ui.create_book.author_placeholder",
              "Autorenname oder Pen Name",
            )}
            addToAuthorsLabel={t(
              "ui.create_book.add_to_authors_db",
              '„{name}" zur Autoren-Datenbank hinzufügen',
            )}
          />
        </div>

        {/* === Stage 2: Optional fields (Radix Collapsible) === */}
        <Collapsible.Root open={detailsOpen} onOpenChange={setDetailsOpen}>
          <Collapsible.Trigger asChild>
            <button className={styles.detailsToggle}>
              {detailsOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              {t("ui.create_book.more_details", "Weitere Details")}
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content>
            <div className={styles.detailsSection}>
              <div className="field">
                <label className="label">
                  {t("ui.create_book.genre", "Genre")}
                </label>
                <input
                  className="input"
                  list="genre-suggestions"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder={t(
                    "ui.create_book.genre_placeholder",
                    "Genre wählen oder eingeben...",
                  )}
                />
                <datalist id="genre-suggestions">
                  {[
                    t("ui.genres.novel", "Roman"),
                    t("ui.genres.non_fiction", "Sachbuch"),
                    t("ui.genres.technical", "Fachbuch"),
                    t("ui.genres.children", "Kinderbuch"),
                    t("ui.genres.biography", "Biografie"),
                    t("ui.genres.poetry", "Lyrik"),
                    t("ui.genres.short_stories", "Kurzgeschichten"),
                    t("ui.genres.academic", "Wissenschaftlich"),
                    t("ui.genres.textbook", "Lehrbuch"),
                    t("ui.genres.self_help", "Ratgeber"),
                    t("ui.genres.fantasy", "Fantasy"),
                    t("ui.genres.thriller", "Thriller"),
                    t("ui.genres.romance", "Liebesroman"),
                    t("ui.genres.cookbook", "Kochbuch"),
                    t("ui.genres.travel", "Reisefuehrer"),
                  ].map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>

              <div className="field">
                <label className="label">
                  {t("ui.create_book.subtitle", "Untertitel")}
                </label>
                <input
                  className="input"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  placeholder={t("ui.create_book.subtitle_placeholder", "Optional")}
                />
              </div>

              <div className="field">
                <label className="label">
                  {t("ui.create_book.description", "Beschreibung")}
                </label>
                <EnhancedTextarea
                  value={description}
                  onChange={setDescription}
                  placeholder={t(
                    "ui.create_book.description_placeholder",
                    "Kurze Beschreibung (optional)",
                  )}
                  rows={3}
                  ariaLabel={t("ui.create_book.description", "Beschreibung")}
                  testid="create-book-description"
                />
              </div>

              <div className="field">
                <label className="label">
                  {t("ui.create_book.language", "Sprache")}
                </label>
                <Select.Root value={language} onValueChange={setLanguage}>
                  <Select.Trigger className="radix-select-trigger">
                    <Select.Value />
                    <Select.Icon>
                      <ChevronDown size={14} />
                    </Select.Icon>
                  </Select.Trigger>
                  <Select.Portal>
                    <Select.Content
                      className="radix-select-content"
                      position="popper"
                      sideOffset={4}
                    >
                      <Select.Viewport>
                        {[
                          { value: "de", label: t("ui.languages.de", "Deutsch") },
                          { value: "en", label: t("ui.languages.en", "English") },
                          { value: "es", label: t("ui.languages.es", "Espanol") },
                          { value: "fr", label: t("ui.languages.fr", "Francais") },
                          { value: "el", label: t("ui.languages.el", "Ellinika") },
                        ].map((opt) => (
                          <Select.Item
                            key={opt.value}
                            value={opt.value}
                            className="radix-select-item"
                          >
                            <Select.ItemText>{opt.label}</Select.ItemText>
                          </Select.Item>
                        ))}
                      </Select.Viewport>
                    </Select.Content>
                  </Select.Portal>
                </Select.Root>
              </div>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={isSeries}
                  onChange={(e) => {
                    setIsSeries(e.target.checked);
                    if (!e.target.checked) {
                      setSeries("");
                      setSeriesIndex("");
                    }
                  }}
                  style={{ accentColor: "var(--accent)" }}
                />
                {t("ui.create_book.is_series", "Teil einer Serie")}
              </label>

              {isSeries && (
                <div className={styles.row}>
                  <div className="field" style={{ flex: 2 }}>
                    <label className="label">
                      {t("ui.create_book.series", "Reihe")}
                    </label>
                    <input
                      className="input"
                      value={series}
                      onChange={(e) => setSeries(e.target.value)}
                      placeholder={t(
                        "ui.create_book.series_placeholder",
                        "z.B. Das unsterbliche Muster",
                      )}
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label className="label">
                      {t("ui.create_book.volume", "Band")}
                    </label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      value={seriesIndex}
                      onChange={(e) => setSeriesIndex(e.target.value)}
                      placeholder={t("ui.create_book.volume_placeholder", "Nr.")}
                    />
                  </div>
                </div>
              )}
            </div>
          </Collapsible.Content>
        </Collapsible.Root>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <button className="btn btn-ghost" onClick={onCancel}>
          {t("ui.common.cancel", "Abbrechen")}
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          data-testid="create-book-submit"
        >
          {t("ui.common.create", "Erstellen")}
        </button>
      </div>
    </div>
  );
}
