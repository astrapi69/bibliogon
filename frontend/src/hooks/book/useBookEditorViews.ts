import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * URL-state machinery for the prose BookEditor's view switching.
 *
 * Owns the four mutually-exclusive view flags (metadata / storyboard /
 * outline / relationships) plus the active-chapter selection, all mirrored
 * into the query string (``?view=`` / ``?chapter=``) so they are
 * deep-linkable and survive browser back-forward navigation.
 *
 * The ``onSelectChapter`` callback runs inside ``selectChapter`` before the
 * atomic URL write (used by the editor to clear any open Story-Bible entity).
 */
export function useBookEditorViews(onSelectChapter?: () => void) {
    const [searchParams, setSearchParams] = useSearchParams();
    // Hold the side-effect callback in a ref so ``selectChapter`` stays a
    // stable reference (its only real dep is the stable ``setSearchParams``),
    // matching the original component's memoisation exactly.
    const onSelectChapterRef = useRef(onSelectChapter);
    onSelectChapterRef.current = onSelectChapter;
    const [showMetadata, setShowMetadata] = useState(searchParams.get("view") === "metadata");
    const [showStoryboard, setShowStoryboard] = useState(searchParams.get("view") === "storyboard");
    // CHAPTER-OUTLINER-VIEW-01: the spreadsheet outline view.
    const [showOutline, setShowOutline] = useState(searchParams.get("view") === "outline");
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
        if (wantsRelationships !== showRelationships) setShowRelationships(wantsRelationships);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const _setShowMetadata = (next: boolean) => {
        setShowMetadata(next);
        if (next) {
            setShowStoryboard(false);
            setShowOutline(false);
            setShowRelationships(false);
        }
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (next) params.set("view", "metadata");
                else if (params.get("view") === "metadata") params.delete("view");
                return params;
            },
            { replace: true },
        );
    };

    const _setShowStoryboard = (next: boolean) => {
        setShowStoryboard(next);
        if (next) {
            setShowMetadata(false);
            setShowOutline(false);
            setShowRelationships(false);
        }
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (next) params.set("view", "storyboard");
                else if (params.get("view") === "storyboard") params.delete("view");
                return params;
            },
            { replace: true },
        );
    };

    const _setShowOutline = (next: boolean) => {
        setShowOutline(next);
        if (next) {
            setShowMetadata(false);
            setShowStoryboard(false);
            setShowRelationships(false);
        }
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (next) params.set("view", "outline");
                else if (params.get("view") === "outline") params.delete("view");
                return params;
            },
            { replace: true },
        );
    };

    const _setShowRelationships = (next: boolean) => {
        setShowRelationships(next);
        if (next) {
            setShowMetadata(false);
            setShowStoryboard(false);
            setShowOutline(false);
        }
        setSearchParams(
            (prev) => {
                const params = new URLSearchParams(prev);
                if (next) params.set("view", "relationships");
                else if (params.get("view") === "relationships") params.delete("view");
                return params;
            },
            { replace: true },
        );
    };
    // Dialog->Pages C6: the active chapter lives in the URL (``?chapter=``)
    // rather than local state, so a chapter selection is deep-linkable and
    // survives navigating to (and back from) the snapshots page. Derived
    // here; the setter writes the param (preserving ``?view=`` etc.), so
    // all existing call sites keep using ``setActiveChapterId`` unchanged.
    const activeChapterId = searchParams.get("chapter");
    const setActiveChapterId = useCallback(
        (next: string | null | ((prev: string | null) => string | null)) => {
            setSearchParams(
                (prev) => {
                    const params = new URLSearchParams(prev);
                    const resolved =
                        typeof next === "function" ? next(params.get("chapter")) : next;
                    if (resolved) params.set("chapter", resolved);
                    else params.delete("chapter");
                    return params;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );
    // Selecting a chapter must set ``?chapter=`` AND clear any ``?view=`` in a
    // SINGLE setSearchParams call. react-router's setSearchParams resolves its
    // argument against the render-time ``searchParams`` snapshot, so two
    // separate calls in one event handler (e.g. setActiveChapterId then
    // _setShowMetadata(false)) both read the stale snapshot and the second
    // navigate clobbers the first - the URL never gains the new chapter and the
    // editor stays on the old one. One atomic write avoids the clobber; the
    // ``?view=`` reconcile effect mirrors the cleared view into the booleans,
    // and they are also cleared here for an immediate render.
    const selectChapter = useCallback(
        (chapterId: string) => {
            setShowMetadata(false);
            setShowStoryboard(false);
            setShowOutline(false);
            setShowRelationships(false);
            onSelectChapterRef.current?.();
            setSearchParams(
                (prev) => {
                    const params = new URLSearchParams(prev);
                    params.set("chapter", chapterId);
                    params.delete("view");
                    return params;
                },
                { replace: true },
            );
        },
        [setSearchParams],
    );

    return {
        showMetadata,
        showStoryboard,
        showOutline,
        showRelationships,
        setShowMetadata,
        setShowStoryboard,
        setShowOutline,
        setShowRelationships,
        _setShowMetadata,
        _setShowStoryboard,
        _setShowOutline,
        _setShowRelationships,
        activeChapterId,
        setActiveChapterId,
        selectChapter,
    };
}
