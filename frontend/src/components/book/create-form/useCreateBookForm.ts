/**
 * State, effects and submit/delete handlers for the book-creation form.
 * Extracted from CreateBookForm.tsx (#677) so the component stays a thin
 * presentational shell. Behaviour is unchanged from the in-component
 * version: required validation, collapsible optional fields, genre key
 * mapping, template picker, and Authors-DB integration.
 */

import { useEffect, useMemo, useState } from "react";
import {
  api,
  ApiError,
  Author,
  BookCreate,
  BookFromTemplateCreate,
  BookTemplate,
  BookType,
} from "../../../api/client";
import { getStorage } from "../../../storage";
import { useBookTypes } from "../../../hooks/book/useBookTypes";
import { useI18n } from "../../../hooks/useI18n";
import { useStorageMode } from "../../../storage/useStorageMode";
import { clientTemplateCatalog } from "../../../data/bookTemplates";
import { useDialog } from "../../shared/AppDialog";
import { notify } from "../../../utils/platform/notify";

type Mode = "blank" | "template";

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

interface Options {
  onCreate: (data: BookCreate) => void;
  onCreateFromTemplate?: (data: BookFromTemplateCreate) => void;
  bookType: BookType;
}

export function useCreateBookForm({
  onCreate,
  onCreateFromTemplate,
  bookType,
}: Options) {
  const { t } = useI18n();
  const dialog = useDialog();
  // BOOK-TYPES-SSOT-YAML-01 C6: query the registry for this book type's
  // capabilities. template_catalog drives the template-tab visibility.
  const bookTypesSnapshot = useBookTypes();
  const supportsTemplateCatalog =
    bookTypesSnapshot.types[bookType]?.capabilities.template_catalog ?? false;

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
  // True once the user has picked a language, OR a template set it.
  // Gates the late-arriving ui.defaults.book_language from clobbering a
  // value the user already chose.
  const [languageTouched, setLanguageTouched] = useState(false);
  const [customLanguages, setCustomLanguages] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [isSeries, setIsSeries] = useState(false);
  const [series, setSeries] = useState("");
  const [seriesIndex, setSeriesIndex] = useState("");

  // Offline (Dexie) mode swaps the backend template catalog for the
  // client-side built-in catalog (frontend/src/data/bookTemplates.ts), so
  // "Aus Vorlage" works on the backendless PWA with zero /api calls.
  const { mode: storageMode } = useStorageMode();
  const dexie = storageMode === "dexie";

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
      setTemplates((prev) => (prev ? prev.filter((t) => t.id !== tpl.id) : prev));
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
    getStorage()
      .settings.getApp()
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
        const uiConfig = (config.ui || {}) as Record<string, unknown>;
        const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
        const defaultLang = (uiDefaults.book_language as string) || "";
        if (defaultLang) {
          setLanguage((prev) => (languageTouched ? prev : defaultLang));
        }
        const custom = Array.isArray(uiConfig.custom_languages)
          ? (uiConfig.custom_languages as string[]).filter(Boolean)
          : [];
        setCustomLanguages(custom);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load global Authors-Database snapshot on mount. Powers the author-
  // field datalist alongside authorChoices. Non-blocking; silent
  // fallback on fetch error.
  useEffect(() => {
    let cancelled = false;
    getStorage()
      .authors.list({})
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

  // The book-author dropdown lists ONLY the user's profile authors
  // (real name + pen names). The Authors-Database is a catalog of OTHER
  // known authors (co-authors, imported names) and is deliberately kept
  // out of the suggestions — your book is your identity. Deduped +
  // trimmed, profile order preserved.
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
    return out;
  }, [authorChoices]);

  // True when the typed author matches an existing Authors-DB entry
  // (trim + case-insensitive). Controls the "Add to Authors-Database"
  // checkbox visibility: hidden when the entry already exists.
  const authorAlreadyInDb = useMemo(() => {
    const trimmed = author.trim().toLowerCase();
    if (!trimmed) return true;
    return globalAuthors.some((a) => a.name.trim().toLowerCase() === trimmed);
  }, [author, globalAuthors]);
  const showAddToAuthorsCheckbox = !authorAlreadyInDb;

  // Eagerly load the template catalog so the tab switcher can be shown ONLY
  // when at least one template exists - mode-agnostic. A tab that only ever
  // says "Keine Vorlagen verfügbar" is noise, so an empty list hides the
  // switcher and renders the create form directly.
  //
  // Offline (Dexie) loads the client-side built-in catalog for this book
  // type — works for prose AND picture-book/comic (bypassing the backend-
  // only template_catalog capability), fires no /api. Online keeps the
  // backend catalog gated on the registry's template_catalog flag.
  useEffect(() => {
    if (templates !== null) return;
    if (dexie) {
      setTemplates(clientTemplateCatalog(bookType, t));
      setTemplatesError(null);
      return;
    }
    if (!supportsTemplateCatalog) {
      setTemplates([]);
      return;
    }
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
    // `t` is intentionally excluded — the i18n mock returns a fresh `t`
    // per render in tests, which would re-run this load effect endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsTemplateCatalog, templates, dexie, bookType]);

  // The tab switcher appears once the loaded catalog has >= 1 template
  // (offline client catalog or online backend catalog).
  const showTemplateTabs = (templates?.length ?? 0) > 0;

  // When a template is picked, pre-fill language + description from it
  useEffect(() => {
    if (!selectedTemplateId || !templates) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    setLanguage(tpl.language);
    setLanguageTouched(true);
    setDescription(tpl.description);
  }, [selectedTemplateId, templates]);

  const resetForm = () => {
    setTitle("");
    setAuthor("");
    setGenre("");
    setLanguage("de");
    setLanguageTouched(false);
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
        (k) => t(`ui.genres.${k}`, k).toLowerCase() === genreValue.toLowerCase(),
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

  return {
    mode,
    setMode,
    title,
    setTitle,
    author,
    setAuthor,
    authorSuggestions,
    showAddToAuthorsCheckbox,
    addToAuthorsDb,
    setAddToAuthorsDb,
    detailsOpen,
    setDetailsOpen,
    genre,
    setGenre,
    subtitle,
    setSubtitle,
    language,
    setLanguage,
    setLanguageTouched,
    customLanguages,
    setCustomLanguages,
    description,
    setDescription,
    isSeries,
    setIsSeries,
    series,
    setSeries,
    seriesIndex,
    setSeriesIndex,
    templates,
    templatesError,
    selectedTemplateId,
    setSelectedTemplateId,
    showTemplateTabs,
    handleDeleteTemplate,
    handleSubmit,
    canSubmit,
  };
}
