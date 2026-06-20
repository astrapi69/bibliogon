import { useEffect, useMemo, useState } from "react";
import { api, Author, BookDetail, type GitSyncMappingStatus } from "../../api/client";
import { getStorage } from "../../storage";
import { notify } from "../../utils/notify";
import { useAuthorProfile, profileDisplayNames } from "../useAuthorProfile";
import { useI18n } from "../useI18n";

export interface UseBookMetadataParams {
    book: BookDetail;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    /** Whether the KDP-category catalog probe should run (backend-only). */
    kdpCatalogActive: boolean;
    /** Whether the git-sync status probe should run (backend-only). */
    gitSyncActive: boolean;
}

export interface UseBookMetadataResult {
    form: Record<string, string | null>;
    setForm: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
    set: (key: string, value: string) => void;
    keywords: string[];
    setKeywords: React.Dispatch<React.SetStateAction<string[]>>;
    categories: string[];
    setCategories: React.Dispatch<React.SetStateAction<string[]>>;
    bisacCodes: string[];
    setBisacCodes: React.Dispatch<React.SetStateAction<string[]>>;
    kdpCategoriesCatalog: string[];
    gitSyncStatus: GitSyncMappingStatus | null;
    audiobookOverwrite: boolean;
    setAudiobookOverwrite: React.Dispatch<React.SetStateAction<boolean>>;
    audiobookSkipTypes: string[];
    setAudiobookSkipTypes: React.Dispatch<React.SetStateAction<string[]>>;
    saving: boolean;
    addAuthorToDb: boolean;
    setAddAuthorToDb: React.Dispatch<React.SetStateAction<boolean>>;
    authorSuggestions: string[];
    showAddToAuthorsCheckbox: boolean;
    wordsPerDayHint: string | null;
    handleSave: () => Promise<void>;
}

/**
 * State + orchestration for the book-metadata editor form.
 *
 * Holds the entire metadata form cluster (form fields, keyword /
 * category / BISAC chip lists, audiobook config flags, global-author
 * opt-in), the backend-only probes (KDP catalog + git-sync status),
 * the reset-on-book-change effect, and the persistence handler.
 *
 * @param params - Active book, the parent save callback, and the two
 *   feature-gate flags that decide whether the backend-only probes run.
 * @returns Everything the BookMetadataEditor JSX reads and writes.
 */
export function useBookMetadata({
    book,
    onSave,
    kdpCatalogActive,
    gitSyncActive,
}: UseBookMetadataParams): UseBookMetadataResult {
    const { t } = useI18n();
    const [form, setForm] = useState<Record<string, string | null>>({});
    const [keywords, setKeywords] = useState<string[]>([]);
    // Bug 9: Books-only subject categorisation. Pair of free-text +
    // format-validated chip lists in the Marketing tab.
    const [categories, setCategories] = useState<string[]>([]);
    const [bisacCodes, setBisacCodes] = useState<string[]>([]);
    // KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01: bundled KDP category
    // catalog (26 Amazon-canonical names), fetched once per
    // BookMetadataEditor mount and fed to CategoryInput's
    // `suggestions` prop. Empty until the fetch resolves; on
    // failure stays empty (CategoryInput is free-text-capable, so
    // a missing catalog degrades gracefully to plain typing).
    const [kdpCategoriesCatalog, setKdpCategoriesCatalog] = useState<string[]>([]);
    // BOOK-REPOSITORY-URL-FIELD-01 C3: snapshot of the
    // plugin-git-sync mapping for this book. When ``mapped=true``,
    // the General-tab Repository-URL field switches to read-only
    // and surfaces ``status.repo_url`` (the canonical URL the
    // round-trip uses). When ``mapped=false`` OR the call fails,
    // the field falls back to free input editing ``Book.repository_url``.
    const [gitSyncStatus, setGitSyncStatus] = useState<GitSyncMappingStatus | null>(null);
    const [audiobookOverwrite, setAudiobookOverwrite] = useState<boolean>(false);
    const [audiobookSkipTypes, setAudiobookSkipTypes] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const authorProfile = useAuthorProfile();

    useEffect(() => {
        setForm({
            author: book.author || "",
            language: book.language || "de",
            subtitle: book.subtitle || "",
            description: book.description || "",
            book_idea: book.book_idea || "",
            expose: book.expose || "",
            // Writing goals (WRITING-GOALS-PROGRESS-TRACKING-01).
            word_target: book.word_target != null ? String(book.word_target) : "",
            word_target_deadline: book.word_target_deadline || "",
            edition: book.edition || "",
            publisher: book.publisher || "",
            publisher_city: book.publisher_city || "",
            publish_date: book.publish_date || "",
            isbn_ebook: book.isbn_ebook || "",
            isbn_paperback: book.isbn_paperback || "",
            isbn_hardcover: book.isbn_hardcover || "",
            asin_ebook: book.asin_ebook || "",
            asin_paperback: book.asin_paperback || "",
            asin_hardcover: book.asin_hardcover || "",
            html_description: book.html_description || "",
            backpage_description: book.backpage_description || "",
            backpage_author_bio: book.backpage_author_bio || "",
            cover_image: book.cover_image || "",
            custom_css: book.custom_css || "",
            tts_engine: book.tts_engine || "",
            tts_voice: book.tts_voice || "",
            tts_speed: book.tts_speed || "1.0",
            audiobook_merge: book.audiobook_merge || "merged",
            audiobook_filename: book.audiobook_filename || "",
            repository_url: book.repository_url || "",
        });
        setKeywords(Array.isArray(book.keywords) ? book.keywords : []);
        setCategories(Array.isArray(book.categories) ? book.categories : []);
        setBisacCodes(Array.isArray(book.bisac_codes) ? book.bisac_codes : []);
        setAudiobookOverwrite(Boolean(book.audiobook_overwrite_existing));
        setAudiobookSkipTypes(
            Array.isArray(book.audiobook_skip_chapter_types)
                ? book.audiobook_skip_chapter_types
                : [],
        );
    }, [book]);

    // KDP-CATEGORIES-WIRE-TO-CATEGORYINPUT-01: one-shot fetch of the
    // KDP-category catalog on mount. Cached for the editor's
    // lifetime — Amazon-side catalog is stable across the surface,
    // no need to re-fetch on every book change. Failure stays at
    // empty list; CategoryInput remains free-text-capable.
    useEffect(() => {
        // KDP category catalog is a backend-only convenience; when the
        // feature is inactive (dexie) the field stays free-text. Skip the
        // fetch so dexie mode fires no /api call.
        if (!kdpCatalogActive) return;
        let cancelled = false;
        api.kdp
            .listCategories()
            .then((catalog) => {
                if (!cancelled) setKdpCategoriesCatalog(catalog);
            })
            .catch(() => {
                // Silent degrade — autocomplete is a convenience, not
                // a correctness requirement. The Categories field
                // still accepts free-text input via CategoryInput.
            });
        return () => {
            cancelled = true;
        };
    }, [kdpCatalogActive]);

    // BOOK-REPOSITORY-URL-FIELD-01 C3: fetch the GitSyncMapping
    // status for this book on mount + on book.id change. When
    // ``mapped=true``, the Repository-URL field renders read-only
    // and shows the mapping's canonical URL (the round-trip uses
    // it; manual edits would diverge from the on-disk clone).
    // Silent failure: gitSyncStatus stays null, the field falls
    // back to free-input editing Book.repository_url.
    useEffect(() => {
        // Git-sync is a backend-only feature; when inactive (dexie) the
        // Repository-URL field stays free-input. Skip the status probe so
        // dexie mode fires no /api call.
        if (!gitSyncActive) return;
        let cancelled = false;
        api.gitSync
            .status(book.id)
            .then((status) => {
                if (!cancelled) setGitSyncStatus(status);
            })
            .catch(() => {
                // Silent degrade — the field still works as a
                // free input. Most-likely cause: the git-sync
                // router is not registered (plugin disabled).
            });
        return () => {
            cancelled = true;
        };
    }, [book.id, gitSyncActive]);

    // AUTHOR-DATALIST-EXTEND-EDITORS-01: Pattern A (Datalist) author
    // selection. The dropdown lists ONLY the user's profile authors
    // (real name + pen names); the Authors-Database is loaded purely to
    // gate the "Add to database" checkbox, never to feed suggestions —
    // a book's author is the user's identity, not a catalog entry.
    const [globalAuthors, setGlobalAuthors] = useState<Author[]>([]);
    const [addAuthorToDb, setAddAuthorToDb] = useState(true);
    useEffect(() => {
        let cancelled = false;
        getStorage()
            .authors.list({})
            .then((rows) => {
                if (!cancelled) setGlobalAuthors(rows);
            })
            .catch(() => {
                // Non-critical; the datalist degrades to user-profile
                // suggestions only.
            });
        return () => {
            cancelled = true;
        };
    }, []);
    const authorSuggestions = useMemo(() => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const c of profileDisplayNames(authorProfile)) {
            const trimmed = c.trim();
            if (trimmed && !seen.has(trimmed)) {
                seen.add(trimmed);
                out.push(trimmed);
            }
        }
        return out;
    }, [authorProfile]);
    const showAddToAuthorsCheckbox = useMemo(() => {
        const trimmed = (form.author ?? "").trim().toLowerCase();
        if (!trimmed) return false;
        return !globalAuthors.some((a) => a.name.trim().toLowerCase() === trimmed);
    }, [form.author, globalAuthors]);

    const set = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

    // Writing-target deadline hint (WRITING-GOALS-PROGRESS-TRACKING-01):
    // "N days left, ~X words/day for the full target". Derived from the
    // target ÷ days remaining (an at-a-glance pace, not subtracting
    // already-written words — the metadata editor doesn't hold the live
    // total).
    const wordsPerDayHint = useMemo(() => {
        const target = parseInt(form.word_target ?? "", 10);
        const deadline = form.word_target_deadline;
        if (!Number.isFinite(target) || target <= 0 || !deadline) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dl = new Date(deadline + "T00:00:00");
        const days = Math.ceil((dl.getTime() - today.getTime()) / 86_400_000);
        if (days <= 0) return t("ui.metadata.deadline_passed", "Deadline has passed");
        const perDay = Math.ceil(target / days);
        return t(
            "ui.metadata.words_per_day",
            "{days} days left, ~{n} words/day for the full target",
        )
            .replace("{days}", String(days))
            .replace("{n}", String(perDay));
    }, [form.word_target, form.word_target_deadline, t]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // AUTHOR-DATALIST-EXTEND-EDITORS-01: create the typed
            // author in the global Authors-DB BEFORE the book PATCH
            // when the user opted in. Mirrors CreateBookModal's
            // pattern. Non-blocking — a failed author POST surfaces
            // an error toast but the book save still proceeds with
            // the free-text author value.
            const typedAuthor = (form.author ?? "").trim();
            if (showAddToAuthorsCheckbox && addAuthorToDb && typedAuthor) {
                try {
                    const created = await getStorage().authors.create({ name: typedAuthor });
                    setGlobalAuthors((prev) => [...prev, created]);
                } catch (err) {
                    notify.error(
                        t(
                            "ui.metadata.author_add_failed",
                            "Autor konnte nicht zur Datenbank hinzugefügt werden",
                        ),
                        err,
                    );
                }
            }

            const data: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(form)) {
                data[key] = value || null;
            }
            data.keywords = keywords;
            data.categories = categories;
            data.bisac_codes = bisacCodes;
            data.audiobook_overwrite_existing = audiobookOverwrite;
            data.audiobook_skip_chapter_types = audiobookSkipTypes;
            await onSave(data);
            notify.success(t("ui.common.save", "Metadaten gespeichert"));
        } catch (err) {
            notify.error(t("ui.common.error", "Fehler beim Speichern"), err);
        }
        setSaving(false);
    };

    return {
        form,
        setForm,
        set,
        keywords,
        setKeywords,
        categories,
        setCategories,
        bisacCodes,
        setBisacCodes,
        kdpCategoriesCatalog,
        gitSyncStatus,
        audiobookOverwrite,
        setAudiobookOverwrite,
        audiobookSkipTypes,
        setAudiobookSkipTypes,
        saving,
        addAuthorToDb,
        setAddAuthorToDb,
        authorSuggestions,
        showAddToAuthorsCheckbox,
        wordsPerDayHint,
        handleSave,
    };
}
