import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  SaveAbortedError,
  BookDetail,
  Chapter,
  ChapterType,
} from "../api/client";
import ConflictResolutionDialog, {
  type ConflictInfo,
} from "../components/ConflictResolutionDialog";
import ChapterSidebar from "../components/ChapterSidebar";
import { OfflineToggleButton } from "../components/OfflineToggleButton";
import { getStorage } from "../storage";
import StoryBibleSidebar from "../components/StoryBibleSidebar";
import StoryEntityEditor from "../components/StoryEntityEditor";
import PageEditor from "../components/PageEditor";
import ComicBookEditor from "../components/ComicBookEditor";
import Storyboard from "../components/Storyboard";
import ProseStoryboard from "../components/ProseStoryboard";
import ChapterOutliner from "../components/ChapterOutliner";
import RelationshipGraphView from "../components/RelationshipGraphView";
import { pageableBookTypeIds, useBookTypes } from "../hooks/useBookTypes";
import Editor from "../components/Editor";
import BookMetadataEditor from "../components/BookMetadataEditor";
import type { NavigableFindingType } from "../components/QualityTab";
import SaveAsTemplateModal from "../components/SaveAsTemplateModal";
import ChapterTemplatePickerModal from "../components/ChapterTemplatePickerModal";
import SaveAsChapterTemplateModal from "../components/SaveAsChapterTemplateModal";
import { useDialog } from "../components/AppDialog";
import { notify } from "../utils/notify";
import { useI18n } from "../hooks/useI18n";
import { useOfflineFeatureGate } from "../storage/useOfflineFeatureGate";
import { OfflineFeatureNotice } from "../components/OfflineFeatureNotice";
import { BookOpen, Menu, Plus } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { LoadingIndicator } from "../components/LoadingIndicator";
import styles from "./BookEditor.module.css";

// BOOK-TYPES-SSOT-YAML-01 C6: editor dispatch table. The
// registry's ``editor_component`` field is a string name; this
// map resolves it to the actual React component at render time.
// Adding a new page-based book type with a different editor =
// add the component import + one entry here. New chapter-based
// types fall through to the prose path automatically.
const EDITOR_COMPONENTS: Record<
  string,
  React.ComponentType<{
    bookId: string;
    bookTitle: string;
    onBack: () => void;
    onShowMetadata: () => void;
    /** Optional storyboard entry-point. Wired for both
     *  picture_book (PageEditor) and comic_book (ComicBookEditor)
     *  per STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1;
     *  gated by STORYBOARD_BOOK_TYPES. */
    onShowStoryboard?: () => void;
    onTitleSave?: (title: string) => void | Promise<void>;
    isPublished?: boolean;
  }>
> = {
  PageEditor,
  ComicBookEditor,
};

/** Per-editor allow-list for the Storyboard view. Mirrors the
 *  ``content_model: pages`` gate. Originally picture_book-only per
 *  A4 of the PICTURE-BOOK-STORYBOARD-VIEW-01 Pre-Inspection;
 *  STORY-BIBLE-STORYBOARD-INTEGRATION-01 Phase 1 C1 extends it to
 *  comic_book — the Storyboard annotation columns (notes,
 *  story_beat, mood_color, act_group) exist on ALL Page records,
 *  and StoryboardCard renders comic pages via the layout-tag path
 *  (no panel thumbnail yet; a richer panel-thumbnail render is a
 *  tracked follow-up). */
const STORYBOARD_BOOK_TYPES = new Set<string>(["picture_book", "comic_book"]);

export default function BookEditor() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const dialog = useDialog();
  const { t } = useI18n();
  const { offline: offlineGate } = useOfflineFeatureGate();
  const bookTypesSnapshot = useBookTypes();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Story Bible (plugin-story-bible). Availability is probed once
  // via getInfo (404 when the plugin is disabled); the panel + its
  // toggle only render when the plugin is mounted.
  const [storyBibleAvailable, setStoryBibleAvailable] = useState(false);
  const [storyBibleOpen, setStoryBibleOpen] = useState(false);
  // The Story Bible entry whose detail/edit view occupies the main
  // content area (C5). refreshKey re-fetches the sidebar list after
  // editor-driven changes.
  const [selectedStoryEntityId, setSelectedStoryEntityId] = useState<
    string | null
  >(null);
  const [storyBibleRefreshKey, setStoryBibleRefreshKey] = useState(0);
  const TYPE_LABELS: Record<ChapterType, string> = {
    chapter: t("ui.chapter_types.chapter", "Kapitel"),
    preface: t("ui.chapter_types.preface", "Vorwort"),
    foreword: t("ui.chapter_types.foreword", "Geleitwort"),
    acknowledgments: t("ui.chapter_types.acknowledgments", "Danksagung"),
    about_author: t("ui.chapter_types.about_author", "Über den Autor"),
    appendix: t("ui.chapter_types.appendix", "Anhang"),
    bibliography: t("ui.chapter_types.bibliography", "Literatur"),
    glossary: t("ui.chapter_types.glossary", "Glossar"),
    epilogue: t("ui.chapter_types.epilogue", "Epilog"),
    imprint: t("ui.chapter_types.imprint", "Impressum"),
    next_in_series: t("ui.chapter_types.next_in_series", "Nächster Band"),
    part: t("ui.chapter_types.part", "Teil"),
    part_intro: t("ui.chapter_types.part_intro", "Teil-Einleitung"),
    interlude: t("ui.chapter_types.interlude", "Interludium"),
    toc: t("ui.chapter_types.toc", "Inhaltsverzeichnis"),
    dedication: t("ui.chapter_types.dedication", "Widmung"),
    prologue: t("ui.chapter_types.prologue", "Prolog"),
    introduction: t("ui.chapter_types.introduction", "Einleitung"),
    afterword: t("ui.chapter_types.afterword", "Nachwort"),
    final_thoughts: t("ui.chapter_types.final_thoughts", "Schlussgedanken"),
    index: t("ui.chapter_types.index", "Stichwortverzeichnis"),
    epigraph: t("ui.chapter_types.epigraph", "Motto"),
    endnotes: t("ui.chapter_types.endnotes", "Endnoten"),
    also_by_author: t("ui.chapter_types.also_by_author", "Weitere Bücher"),
    excerpt: t("ui.chapter_types.excerpt", "Leseprobe"),
    call_to_action: t("ui.chapter_types.call_to_action", "Aufruf zur Aktion"),
  };
  const [book, setBook] = useState<BookDetail | null>(null);
  const [allBooks, setAllBooks] = useState<import("../api/client").Book[]>([]);
  const [gitSyncState, setGitSyncState] = useState<string | null>(null);
  const [gitSyncMapped, setGitSyncMapped] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showChapterTemplatePicker, setShowChapterTemplatePicker] =
    useState(false);
  const [saveChapterTemplateId, setSaveChapterTemplateId] = useState<
    string | null
  >(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [showMetadata, setShowMetadata] = useState(
    searchParams.get("view") === "metadata",
  );
  const [showStoryboard, setShowStoryboard] = useState(
    searchParams.get("view") === "storyboard",
  );
  // CHAPTER-OUTLINER-VIEW-01: the spreadsheet outline view.
  const [showOutline, setShowOutline] = useState(
    searchParams.get("view") === "outline",
  );
  // STORY-BIBLE-RELATIONSHIP-GRAPH-01: the entity relationship graph.
  const [showRelationships, setShowRelationships] = useState(
    searchParams.get("view") === "relationships",
  );

  // Keep ``?view=metadata`` / ``?view=storyboard`` / ``?view=outline``
  // in sync so the audiobook badge / Storyboard back-link / browser
  // back-forward can deep-link in either direction and retain the
  // user's view.
  useEffect(() => {
    const view = searchParams.get("view");
    const wantsMetadata = view === "metadata";
    const wantsStoryboard = view === "storyboard";
    const wantsOutline = view === "outline";
    const wantsRelationships = view === "relationships";
    if (wantsMetadata !== showMetadata) setShowMetadata(wantsMetadata);
    if (wantsStoryboard !== showStoryboard) setShowStoryboard(wantsStoryboard);
    if (wantsOutline !== showOutline) setShowOutline(wantsOutline);
    if (wantsRelationships !== showRelationships)
      setShowRelationships(wantsRelationships);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Probe plugin-story-bible availability once. getInfo rejects
  // (404) when the plugin is disabled; in that case the panel +
  // toggle stay hidden.
  useEffect(() => {
    if (offlineGate) {
      setStoryBibleAvailable(false);
      return;
    }
    let cancelled = false;
    api.storyBible
      .getInfo()
      .then(() => {
        if (!cancelled) setStoryBibleAvailable(true);
      })
      .catch(() => {
        if (!cancelled) setStoryBibleAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [offlineGate]);

  const _setShowMetadata = (next: boolean) => {
    setShowMetadata(next);
    if (next) {
      setShowStoryboard(false);
      setShowOutline(false);
      setShowRelationships(false);
    }
    const params = new URLSearchParams(searchParams);
    if (next) params.set("view", "metadata");
    else if (params.get("view") === "metadata") params.delete("view");
    setSearchParams(params, { replace: true });
  };

  const _setShowStoryboard = (next: boolean) => {
    setShowStoryboard(next);
    if (next) {
      setShowMetadata(false);
      setShowOutline(false);
      setShowRelationships(false);
    }
    const params = new URLSearchParams(searchParams);
    if (next) params.set("view", "storyboard");
    else if (params.get("view") === "storyboard") params.delete("view");
    setSearchParams(params, { replace: true });
  };

  const _setShowOutline = (next: boolean) => {
    setShowOutline(next);
    if (next) {
      setShowMetadata(false);
      setShowStoryboard(false);
      setShowRelationships(false);
    }
    const params = new URLSearchParams(searchParams);
    if (next) params.set("view", "outline");
    else if (params.get("view") === "outline") params.delete("view");
    setSearchParams(params, { replace: true });
  };

  const _setShowRelationships = (next: boolean) => {
    setShowRelationships(next);
    if (next) {
      setShowMetadata(false);
      setShowStoryboard(false);
      setShowOutline(false);
    }
    const params = new URLSearchParams(searchParams);
    if (next) params.set("view", "relationships");
    else if (params.get("view") === "relationships") params.delete("view");
    setSearchParams(params, { replace: true });
  };
  // Dialog->Pages C6: the active chapter lives in the URL (``?chapter=``)
  // rather than local state, so a chapter selection is deep-linkable and
  // survives navigating to (and back from) the snapshots page. Derived
  // here; the setter writes the param (preserving ``?view=`` etc.), so
  // all existing call sites keep using ``setActiveChapterId`` unchanged.
  const activeChapterId = searchParams.get("chapter");
  const setActiveChapterId = useCallback(
    (next: string | null | ((prev: string | null) => string | null)) => {
      const params = new URLSearchParams(searchParams);
      const resolved =
        typeof next === "function" ? next(params.get("chapter")) : next;
      if (resolved) params.set("chapter", resolved);
      else params.delete("chapter");
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const [pendingFocus, setPendingFocus] = useState<{
    chapterId: string;
    type: NavigableFindingType;
    seq: number;
  } | null>(null);
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorSettings, setEditorSettings] = useState<{
    autosave_debounce_ms?: number;
    draft_save_debounce_ms?: number;
    draft_max_age_days?: number;
    ai_context_chars?: number;
  }>({});

  const activeChapterMeta =
    book?.chapters.find((c) => c.id === activeChapterId) ?? null;
  // Loaded chapter content (fetched on demand, not with the book)
  const [loadedContent, setLoadedContent] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  // Fetch chapter content when active chapter changes
  useEffect(() => {
    if (!bookId || !activeChapterId) {
      setLoadedContent(null);
      return;
    }
    if (loadedContent?.id === activeChapterId) return;
    setContentLoading(true);
    getStorage()
      .chapters.get(bookId, activeChapterId)
      .then((ch) => setLoadedContent({ id: ch.id, content: ch.content }))
      .catch(() => notify.error(t("ui.common.error", "Fehler beim Laden")))
      .finally(() => setContentLoading(false));
  }, [bookId, activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshGitSync = useCallback(async () => {
    if (!bookId || offlineGate) return;
    try {
      const sync = await api.git.syncStatus(bookId);
      setGitSyncState(sync.state);
    } catch {
      // Non-fatal: repo may not be initialized yet.
      setGitSyncState(null);
    }
  }, [bookId, offlineGate]);

  const refreshGitSyncMapping = useCallback(async () => {
    if (!bookId || offlineGate) return;
    try {
      const mapping = await api.gitSync.status(bookId);
      setGitSyncMapped(mapping.mapped);
    } catch {
      // Non-fatal: 200/{mapped:false} is the normal "no mapping"
      // shape so anything that throws is a server/network blip;
      // hide the button rather than spam toasts.
      setGitSyncMapped(false);
    }
  }, [bookId, offlineGate]);

  // Bootstrap effect: load book + app settings + book list.
  //
  // StrictMode in dev mode (frontend/src/main.tsx) re-runs effects
  // after a synthetic unmount/remount cycle. Without the cancel
  // guard below, both mounts trigger ``loadBook``; the second
  // response calls ``setBook`` after the user has already started
  // editing, and the new ``book`` object reference cascades into
  // BookMetadataEditor's ``useEffect([book])`` which resets the
  // user's local form/keyword state. The keywords-editor smoke
  // tests caught this as "the first keyword added is dropped".
  useEffect(() => {
    let cancelled = false;
    const runLoad = async () => {
      if (!bookId) return;
      try {
        const data = await getStorage().books.get(bookId);
        if (cancelled) return;
        setBook(data);
        if (data.chapters.length > 0) {
          setActiveChapterId((prev) => {
            if (prev && data.chapters.some((c) => c.id === prev)) return prev;
            return data.chapters[0].id;
          });
        } else {
          setActiveChapterId(null);
        }
        void refreshGitSync();
        void refreshGitSyncMapping();
      } catch (err) {
        if (!cancelled) console.error("Failed to load book:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void runLoad();
    api.settings
      .getApp()
      .then((cfg) => {
        if (cancelled) return;
        const ed = (cfg as Record<string, unknown>).editor as
          | Record<string, number>
          | undefined;
        if (ed) setEditorSettings(ed);
      })
      .catch(() => {});
    getStorage()
      .books.list()
      .then((list) => {
        if (cancelled) return;
        setAllBooks(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  const handleNavigateToIssue = (
    chapterId: string,
    findingType: NavigableFindingType,
  ) => {
    setPendingFocus((prev) => ({
      chapterId,
      type: findingType,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setActiveChapterId(chapterId);
    _setShowMetadata(false);
    setSidebarOpen(false);
  };

  const handleSaveMetadata = async (data: Record<string, unknown>) => {
    if (!bookId) return;
    const updated = await getStorage().books.update(
      bookId,
      data as Partial<import("../api/client").BookCreate>,
    );
    setBook((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  const handleAddChapter = async (chapterType?: ChapterType) => {
    if (!bookId) return;
    const typeLabel = chapterType ? TYPE_LABELS[chapterType] : "Kapitel";
    const title = await dialog.prompt(
      `${typeLabel} erstellen`,
      `Titel für das neue ${typeLabel}:`,
      `z.B. Mein ${typeLabel}`,
    );
    if (!title) return;
    const chapter = await getStorage().chapters.create(bookId, {
      title: title.trim(),
      chapter_type: chapterType || "chapter",
    });
    setBook((prev) => {
      if (!prev) return prev;
      return { ...prev, chapters: [...prev.chapters, chapter] };
    });
    setActiveChapterId(chapter.id);
  };

  const handleAddChapterFromTemplate = async (
    template: import("../api/client").ChapterTemplate,
  ) => {
    if (!bookId) return;
    const childIds = template.child_template_ids ?? [];
    // Group template: insert one chapter per child, in list order.
    // Insertion is intentionally NOT transactional here - on a
    // mid-loop failure the chapters created so far stay so the user
    // can decide whether to retry the rest or delete the partial
    // result.
    if (childIds.length > 0) {
      try {
        const children = await Promise.all(
          childIds.map((cid) => api.chapterTemplates.get(cid)),
        );
        const created: import("../api/client").Chapter[] = [];
        for (const child of children) {
          const chapter = await getStorage().chapters.create(bookId, {
            title: child.name,
            chapter_type: child.chapter_type,
            content: child.content ?? "",
          });
          created.push(chapter);
        }
        setBook((prev) => {
          if (!prev) return prev;
          return { ...prev, chapters: [...prev.chapters, ...created] };
        });
        if (created.length > 0) setActiveChapterId(created[0].id);
        notify.success(
          t(
            "ui.chapter_template_picker.inserted_group",
            "{count} Kapitel aus Gruppe eingefügt",
          ).replace("{count}", String(created.length)),
        );
      } catch (err) {
        notify.error(
          t(
            "ui.chapter_template_picker.insert_failed",
            "Einfügen fehlgeschlagen",
          ),
        );
        throw err;
      }
      return;
    }

    try {
      const chapter = await getStorage().chapters.create(bookId, {
        title: template.name,
        chapter_type: template.chapter_type,
        content: template.content ?? "",
      });
      setBook((prev) => {
        if (!prev) return prev;
        return { ...prev, chapters: [...prev.chapters, chapter] };
      });
      setActiveChapterId(chapter.id);
      notify.success(
        t(
          "ui.chapter_template_picker.inserted",
          "Kapitel aus Vorlage eingefügt",
        ),
      );
    } catch (err) {
      notify.error(
        t(
          "ui.chapter_template_picker.insert_failed",
          "Einfügen fehlgeschlagen",
        ),
      );
      throw err;
    }
  };

  const handleRenameChapter = async (chapterId: string, newTitle: string) => {
    if (!bookId) return;
    const current = book?.chapters.find((c) => c.id === chapterId);
    if (!current) return;
    try {
      const updated = await getStorage().chapters.update(bookId, chapterId, {
        title: newTitle,
        version: current.version,
      });
      setBook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updated.id
              ? { ...c, title: updated.title, version: updated.version }
              : c,
          ),
        };
      });
    } catch (err) {
      // A newer rename superseded this one; the later one will
      // resolve state. No user-visible error.
      if (err instanceof SaveAbortedError) return;
      notify.error(
        t("ui.editor.rename_failed", "Umbenennen fehlgeschlagen"),
        err,
      );
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!bookId) return;
    if (
      !(await dialog.confirm(
        t("ui.editor.delete_chapter_title", "Kapitel löschen"),
        t("ui.editor.delete_chapter_confirm", "Kapitel wirklich löschen?"),
        "danger",
      ))
    )
      return;
    await getStorage().chapters.delete(bookId, chapterId);
    setBook((prev) => {
      if (!prev) return prev;
      const chapters = prev.chapters.filter((c) => c.id !== chapterId);
      return { ...prev, chapters };
    });
    if (activeChapterId === chapterId) {
      setActiveChapterId(
        book?.chapters.find((c) => c.id !== chapterId)?.id ?? null,
      );
    }
  };

  const handleSaveContent = async (content: string) => {
    if (!bookId || !activeChapterId) return;
    const current = book?.chapters.find((c) => c.id === activeChapterId);
    if (!current) return;
    try {
      // Rethrow on failure so the Editor sees the error and sets
      // its status to "error" instead of lying with "saved". 409
      // (version_conflict) is caught below and routed into the
      // conflict resolution dialog.
      const updated = await getStorage().chapters.update(bookId, activeChapterId, {
        content,
        version: current.version,
      });
      setBook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updated.id ? updated : c,
          ),
        };
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.detailBody) {
        const body = err.detailBody as {
          current_version?: number;
          server_content?: string;
          server_title?: string;
          server_updated_at?: string;
        };
        if (
          typeof body.current_version === "number" &&
          typeof body.server_content === "string"
        ) {
          setConflict({
            chapterId: activeChapterId,
            localContent: content,
            serverContent: body.server_content,
            serverVersion: body.current_version,
            serverTitle: body.server_title,
            serverUpdatedAt: body.server_updated_at,
          });
        }
      }
      throw err;
    }
  };

  const resolveConflictKeepLocal = async (info: ConflictInfo) => {
    if (!bookId) return;
    try {
      const updated = await getStorage().chapters.update(bookId, info.chapterId, {
        content: info.localContent,
        version: info.serverVersion,
      });
      setBook((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chapters: prev.chapters.map((c) =>
            c.id === updated.id ? updated : c,
          ),
        };
      });
      setLoadedContent({ id: updated.id, content: updated.content });
      setConflict(null);
      notify.success(
        t("ui.conflict.saved_local", "Deine Änderungen wurden gespeichert."),
      );
    } catch {
      notify.error(
        t(
          "ui.conflict.save_failed_again",
          "Speichern fehlgeschlagen. Bitte erneut versuchen.",
        ),
      );
    }
  };

  const resolveConflictDiscardLocal = (info: ConflictInfo) => {
    if (!bookId) return;
    setBook((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chapters: prev.chapters.map((c) =>
          c.id === info.chapterId
            ? { ...c, content: info.serverContent, version: info.serverVersion }
            : c,
        ),
      };
    });
    setLoadedContent({ id: info.chapterId, content: info.serverContent });
    setConflict(null);
    notify.info(t("ui.conflict.server_restored", "Server-Version geladen."));
  };

  const resolveConflictSaveAsNew = async (info: ConflictInfo) => {
    if (!bookId) return;
    try {
      const sourceTitle = info.serverTitle ?? "";
      const draftSuffix = t(
        "ui.conflict.local_draft_suffix",
        "(Lokaler Entwurf)",
      );
      const forkedTitle = sourceTitle
        ? `${sourceTitle} ${draftSuffix}`.trim()
        : undefined;
      const newChapter = await api.chapters.fork(bookId, info.chapterId, {
        content: info.localContent,
        title: forkedTitle,
      });
      // Reload the book so the new chapter shows up + every
      // position bumped on the server is reflected in state.
      const fresh = await getStorage().books.get(bookId);
      setBook(fresh);
      // Source chapter keeps the server's content; load that
      // into the editor so the user sees the canonical version.
      setLoadedContent({ id: info.chapterId, content: info.serverContent });
      setConflict(null);
      notify.success(
        t(
          "ui.conflict.saved_as_new_chapter",
          'Lokale Änderungen wurden als neues Kapitel "{title}" gespeichert.',
        ).replace("{title}", newChapter.title),
      );
    } catch (err) {
      if (err instanceof ApiError) {
        notify.error(
          t(
            "ui.conflict.save_as_new_failed",
            "Speichern als neues Kapitel fehlgeschlagen.",
          ),
          err,
        );
      }
    }
  };

  const handleReorder = async (chapterIds: string[]) => {
    if (!bookId) return;
    try {
      const reordered = await getStorage().chapters.reorder(bookId, chapterIds);
      setBook((prev) => {
        if (!prev) return prev;
        return { ...prev, chapters: reordered };
      });
    } catch (err) {
      console.error("Reorder failed:", err);
    }
  };

  const handleExport = () => {
    navigate(`/books/${bookId}/export`);
  };

  if (loading) {
    return (
      <LoadingIndicator
        testId="book-editor-loading"
        variant="block"
        label={t("ui.common.loading", "Laden...")}
        className={styles.loading}
      />
    );
  }

  if (!book) {
    return (
      <div className={styles.loading} data-testid="book-editor-not-found">
        <p>{t("ui.editor.book_not_found", "Buch nicht gefunden.")}</p>
      </div>
    );
  }

  // BOOK-TYPES-SSOT-YAML-01 C6: page-based book dispatch via the
  // BookTypeRegistry. Replaces the two near-identical
  // ``book.book_type === "picture_book"`` + ``=== "comic_book"``
  // branches that each duplicated the showMetadata-swap pattern.
  //
  // The registry's content_model="pages" flag picks page-based
  // types; the editor_component name (e.g. "PageEditor",
  // "ComicBookEditor") resolves to the React component via the
  // EDITOR_COMPONENTS map declared at module top. Unknown editor
  // names fall through to the prose path (negative-default safe).
  //
  // PB-PHASE4 Session 5 Commit 2 + COMIC-BOOK-EDITOR-METADATA-
  // BUTTON-01 C2: when ?view=metadata is set (or the editor's
  // "Open metadata" button fires), render BookMetadataEditor
  // in place of the page-based editor — same URL-routed pattern
  // as the prose flow.
  if (pageableBookTypeIds(bookTypesSnapshot).has(book.book_type)) {
    if (offlineGate) {
      return <OfflineFeatureNotice testId="book-editor-offline" />;
    }
    const editorName =
      bookTypesSnapshot.types[book.book_type]?.editor_component;
    const EditorComponent = editorName
      ? EDITOR_COMPONENTS[editorName]
      : undefined;
    if (EditorComponent) {
      const storyboardSupported = STORYBOARD_BOOK_TYPES.has(book.book_type);
      if (showStoryboard && storyboardSupported) {
        return (
          <Storyboard
            bookId={book.id}
            bookTitle={book.title}
            onBack={() => _setShowStoryboard(false)}
            onSelectPage={() => _setShowStoryboard(false)}
          />
        );
      }
      if (showMetadata) {
        return (
          <BookMetadataEditor
            book={book}
            onSave={async (data) => {
              const updated = await getStorage().books.update(book.id, data);
              setBook((prev) =>
                prev ? ({ ...prev, ...updated } as BookDetail) : prev,
              );
            }}
            onBack={() => _setShowMetadata(false)}
            allBooks={allBooks}
            onRefresh={async () => {
              if (!bookId) return;
              const fresh = await getStorage().books.get(bookId);
              setBook(fresh);
            }}
          />
        );
      }
      return (
        <EditorComponent
          bookId={book.id}
          bookTitle={book.title}
          onBack={() => navigate("/")}
          onShowMetadata={() => _setShowMetadata(true)}
          onShowStoryboard={
            storyboardSupported ? () => _setShowStoryboard(true) : undefined
          }
          onTitleSave={async (newTitle) => {
            const updated = await getStorage().books.update(book.id, {
              title: newTitle,
            });
            setBook((prev) =>
              prev ? ({ ...prev, ...updated } as BookDetail) : prev,
            );
          }}
          isPublished={
            book.status === "published" || book.status === "archived"
          }
        />
      );
    }
  }

  return (
    <div className={styles.layout} data-testid="book-editor">
      <h1 className="sr-only">{book.title || "Bibliogon"}</h1>
      {/* Mobile sidebar toggle */}
      {!sidebarOpen && (
        <button
          className="show-mobile-only btn-icon"
          data-testid="book-editor-sidebar-toggle"
          aria-label={t("ui.sidebar.open_sidebar", "Seitenleiste öffnen")}
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 100,
            background: "var(--bg-card)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
          }}
          onClick={() => setSidebarOpen(true)}
        >
          <Menu size={20} />
        </button>
      )}
      <div
        className={
          sidebarOpen
            ? "sidebar-wrapper sidebar-open"
            : "sidebar-wrapper sidebar-closed"
        }
        data-testid="book-editor-sidebar"
      >
        <ChapterSidebar
          bookTitle={book.title}
          onTitleSave={async (newTitle) => {
            const updated = await getStorage().books.update(book.id, {
              title: newTitle,
            });
            setBook((prev) =>
              prev ? ({ ...prev, ...updated } as BookDetail) : prev,
            );
          }}
          titlePublished={
            book.status === "published" || book.status === "archived"
          }
          chapters={book.chapters}
          activeChapterId={showMetadata ? null : activeChapterId}
          onSelect={(id) => {
            setActiveChapterId(id);
            _setShowMetadata(false);
            setSelectedStoryEntityId(null);
            setSidebarOpen(false);
          }}
          onAdd={handleAddChapter}
          onDelete={handleDeleteChapter}
          onRename={handleRenameChapter}
          onBack={() => navigate("/")}
          onExport={handleExport}
          onGitBackup={() => navigate(`/books/${bookId}/git-backup`)}
          offlineSlot={
            bookId ? <OfflineToggleButton bookId={bookId} /> : undefined
          }
          gitSyncState={gitSyncState}
          onGitSync={() => navigate(`/books/${bookId}/git-sync`)}
          gitSyncMapped={gitSyncMapped}
          onMetadata={() => {
            setSelectedStoryEntityId(null);
            _setShowMetadata(true);
          }}
          onStoryBible={
            storyBibleAvailable ? () => setStoryBibleOpen(true) : undefined
          }
          storyBibleActive={storyBibleOpen}
          onShowStoryboard={() => {
            setSelectedStoryEntityId(null);
            _setShowMetadata(false);
            _setShowStoryboard(true);
          }}
          storyboardActive={showStoryboard}
          onShowOutline={() => {
            setSelectedStoryEntityId(null);
            _setShowOutline(true);
          }}
          outlineActive={showOutline}
          onShowRelationships={
            storyBibleAvailable
              ? () => {
                  setSelectedStoryEntityId(null);
                  _setShowRelationships(true);
                }
              : undefined
          }
          relationshipsActive={showRelationships}
          onSaveAsTemplate={() => setShowSaveTemplate(true)}
          onAddFromTemplate={() => setShowChapterTemplatePicker(true)}
          onSaveAsChapterTemplate={(id) => setSaveChapterTemplateId(id)}
          onShowVersions={(id) =>
            navigate(`/books/${bookId}/chapters/${id}/snapshots`)
          }
          showMetadata={showMetadata}
          onReorder={handleReorder}
          hasToc={book.chapters.some((ch) => ch.chapter_type === "toc")}
          onValidateToc={async () => {
            if (!bookId) return;
            try {
              const result = await api.chapters.validateToc(bookId);
              if (!result.toc_found) {
                notify.info(
                  t(
                    "ui.editor.toc_not_found",
                    "Kein Inhaltsverzeichnis gefunden.",
                  ),
                );
              } else if (result.valid) {
                notify.success(
                  t("ui.editor.toc_valid", "TOC gültig: alle Links korrekt."),
                );
              } else {
                const broken = result.broken.map((b) => b.text).join(", ");
                notify.error(
                  t("ui.editor.toc_invalid", "Ungültige Links") + `: ${broken}`,
                );
              }
            } catch {
              notify.error(
                t("ui.editor.toc_error", "Fehler bei der TOC-Validierung."),
              );
            }
          }}
        />
      </div>

      <main id="main-content" className={styles.content}>
        {selectedStoryEntityId ? (
          <StoryEntityEditor
            key={selectedStoryEntityId}
            entityId={selectedStoryEntityId}
            onBack={() => setSelectedStoryEntityId(null)}
            onChanged={() => setStoryBibleRefreshKey((k) => k + 1)}
            onDeleted={() => {
              setSelectedStoryEntityId(null);
              setStoryBibleRefreshKey((k) => k + 1);
            }}
          />
        ) : showStoryboard ? (
          offlineGate ? (
            <OfflineFeatureNotice testId="storyboard-offline" />
          ) : (
          <ProseStoryboard
            bookId={book.id}
            bookTitle={book.title}
            onBack={() => _setShowStoryboard(false)}
            onSelectChapter={(chapterId) => {
              setActiveChapterId(chapterId);
              _setShowStoryboard(false);
            }}
          />
          )
        ) : showOutline ? (
          <ChapterOutliner
            bookId={book.id}
            bookTitle={book.title}
            onBack={() => _setShowOutline(false)}
            onSelectChapter={(chapterId) => {
              setActiveChapterId(chapterId);
              _setShowOutline(false);
            }}
          />
        ) : showRelationships ? (
          offlineGate ? (
            <OfflineFeatureNotice testId="relationships-offline" />
          ) : (
          <RelationshipGraphView
            bookId={book.id}
            savedLayout={book.graph_layout}
            onOpenEntity={(entityId) => {
              setSelectedStoryEntityId(entityId);
            }}
            onShowAppearances={() => {
              _setShowStoryboard(true);
            }}
          />
          )
        ) : showMetadata ? (
          <BookMetadataEditor
            book={book}
            onSave={handleSaveMetadata}
            onBack={() => _setShowMetadata(false)}
            allBooks={allBooks}
            onNavigateToIssue={handleNavigateToIssue}
            onRefresh={() => {
              void getStorage()
                .books.get(book.id, true)
                .then((fresh) => setBook(fresh))
                .catch(() => {});
            }}
          />
        ) : activeChapterMeta &&
          loadedContent?.id === activeChapterMeta.id &&
          !contentLoading ? (
          <Editor
            key={activeChapterMeta.id}
            content={loadedContent.content}
            onSave={handleSaveContent}
            bookId={bookId}
            chapterId={activeChapterMeta.id}
            chapterTitle={activeChapterMeta.title}
            chapterType={activeChapterMeta.chapter_type}
            chapterVersion={activeChapterMeta.version}
            targetWords={activeChapterMeta.target_words}
            bookContext={{
              title: book.title,
              author: book.author || "",
              language: book.language || "de",
              genre: book.genre || "",
              description: book.description || "",
            }}
            placeholder={`Schreibe "${activeChapterMeta.title}"...`}
            autosaveDebounceMs={editorSettings.autosave_debounce_ms}
            draftSaveDebounceMs={editorSettings.draft_save_debounce_ms}
            draftMaxAgeDays={editorSettings.draft_max_age_days}
            aiContextChars={editorSettings.ai_context_chars}
            initialFocus={
              pendingFocus && pendingFocus.chapterId === activeChapterMeta.id
                ? { type: pendingFocus.type, seq: pendingFocus.seq }
                : undefined
            }
            mentionBookId={storyBibleAvailable ? bookId : undefined}
            onOpenStoryEntity={
              storyBibleAvailable
                ? (entityId) => {
                    setSelectedStoryEntityId(entityId);
                    setStoryBibleOpen(true);
                  }
                : undefined
            }
          />
        ) : activeChapterMeta && contentLoading ? (
          <LoadingIndicator
            testId="book-editor-content-loading"
            variant="block"
            label={t("ui.common.loading", "Laden...")}
            className={styles.loading}
          />
        ) : (
          <EmptyState
            testId="book-editor-empty-state"
            icon={
              <BookOpen size={56} strokeWidth={1} color="var(--text-muted)" />
            }
            title={t(
              "ui.editor.empty_title",
              "Erstelle dein erstes Kapitel, um zu beginnen.",
            )}
            body={t(
              "ui.editor.empty_hint",
              'Klicke unten auf "Neues Kapitel" oder waehle einen anderen Kapiteltyp aus der Seitenleiste.',
            )}
            actions={
              <button
                className="btn btn-primary"
                onClick={() => handleAddChapter("chapter")}
                data-testid="book-editor-add-chapter-chapter"
              >
                <Plus size={16} /> {t("ui.editor.new_chapter", "Neues Kapitel")}
              </button>
            }
          />
        )}
      </main>

      {storyBibleAvailable && storyBibleOpen && bookId && (
        <StoryBibleSidebar
          bookId={bookId}
          onClose={() => setStoryBibleOpen(false)}
          onSelectEntity={(entity) => {
            setSelectedStoryEntityId(entity.id);
            _setShowMetadata(false);
          }}
          selectedEntityId={selectedStoryEntityId}
          refreshKey={storyBibleRefreshKey}
        />
      )}
      {/* Story Bible toggle now lives in the ChapterSidebar
                Actions footer (alongside Metadaten) via onStoryBible -
                see BOOK-EDITOR-STORY-BIBLE-BUTTON-01. The old
                free-floating right-edge tab was not UX-conformant. */}

      <SaveAsTemplateModal
        open={showSaveTemplate}
        book={book}
        onClose={() => setShowSaveTemplate(false)}
      />

      <ChapterTemplatePickerModal
        open={showChapterTemplatePicker}
        onClose={() => setShowChapterTemplatePicker(false)}
        onInsert={handleAddChapterFromTemplate}
      />

      {saveChapterTemplateId &&
        bookId &&
        (() => {
          const ch = book.chapters.find((c) => c.id === saveChapterTemplateId);
          if (!ch) return null;
          return (
            <SaveAsChapterTemplateModal
              open={true}
              chapter={ch}
              bookId={bookId}
              onClose={() => setSaveChapterTemplateId(null)}
            />
          );
        })()}
      <ConflictResolutionDialog
        conflict={conflict}
        onKeepLocal={resolveConflictKeepLocal}
        onDiscardLocal={resolveConflictDiscardLocal}
        onSaveAsNewChapter={resolveConflictSaveAsNew}
      />
    </div>
  );
}
