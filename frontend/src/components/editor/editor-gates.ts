/** What kind of content the editor is editing. Drives plugin
 *  gating (audiobook hidden for articles), AI prompt tone, and
 *  which Book/Chapter-coupled features run. See
 *  docs/explorations/article-editor-parity.md (Path D). */
export type ContentKind = "book-chapter" | "article";

/** Per-content-kind plugin enable matrix. */
export interface PluginGates {
    showAudiobook: boolean;
    showGrammar: boolean;
    showStyleCheck: boolean;
    showAiPanel: boolean;
    showSearch: boolean;
    showFocus: boolean;
    showMarkdownMode: boolean;
}

export function pluginsForContentKind(kind: ContentKind): PluginGates {
    if (kind === "article") {
        return {
            // Audiobook is multi-chapter merge with chapter_type
            // skip-list; semantics do not apply to a single-doc
            // article. See parity analysis section 3.
            showAudiobook: false,
            showGrammar: true,
            showStyleCheck: true,
            showAiPanel: true,
            showSearch: true,
            showFocus: true,
            showMarkdownMode: true,
        };
    }
    return {
        showAudiobook: true,
        showGrammar: true,
        showStyleCheck: true,
        showAiPanel: true,
        showSearch: true,
        showFocus: true,
        showMarkdownMode: true,
    };
}
