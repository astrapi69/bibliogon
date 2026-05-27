import React, {useCallback, useEffect, useRef, useState} from "react"
import type {JSONContent} from "@tiptap/core"
import type {Editor} from "@tiptap/react"
import {Image as ImageIcon, Upload, RefreshCw} from "lucide-react"
import {api, type Page, type PageLayout, type PageUpdate} from "../api/client"
import {readLayoutNamespace} from "../utils/layoutConfig"
import {useI18n} from "../hooks/useI18n"
import {useDebouncedCallback} from "../hooks/useDebouncedCallback"
import RichTextEditor from "./RichTextEditor"
import styles from "./PageCanvas.module.css"

/**
 * PB-PHASE4 Session 4c-B-1 Commit 2: per-layout discriminator.
 *
 * D2 storage decision: TipTap JSON for these three layouts (large
 * text regions where rich formatting actually matters); plain
 * string for speech_bubble + image_full_text_overlay (Tier-Property
 * surfaces handle text styling via the layout_config, NOT inline).
 */
const TIPTAP_LAYOUTS: ReadonlySet<PageLayout> = new Set([
    "image_top_text_bottom",
    "image_left_text_right",
    "text_only",
])

function isTipTapLayout(layout: PageLayout): boolean {
    return TIPTAP_LAYOUTS.has(layout)
}

/**
 * Parse ``page.text_content`` (stringified) into a TipTap JSON
 * doc per the D4 migration strategy: legacy plain-text rows get
 * wrapped into a minimal TipTap doc on first read. No Alembic
 * migration; backward-compat lives here.
 */
function parseTextContentToJson(
    textContent: string | null | undefined,
): JSONContent | null {
    if (!textContent) return null
    // Heuristic: TipTap JSON always starts with ``{`` (it's an
    // object literal). Anything else is legacy plain text.
    const trimmed = textContent.trimStart()
    if (trimmed.startsWith("{")) {
        try {
            const parsed = JSON.parse(textContent)
            if (
                parsed &&
                typeof parsed === "object" &&
                parsed.type === "doc"
            ) {
                return parsed as JSONContent
            }
            // Fall through to wrap: parsed but doesn't look like
            // a TipTap doc — rare edge case (e.g. somebody hand-
            // wrote ``{"foo": "bar"}`` into the field).
        } catch {
            // Fall through to wrap: invalid JSON.
        }
    }
    // Wrap as a minimal TipTap doc.
    return {
        type: "doc",
        content: [
            {
                type: "paragraph",
                content: [{type: "text", text: textContent}],
            },
        ],
    }
}

function serializeJsonToText(json: JSONContent | null): string | null {
    if (!json) return null
    return JSON.stringify(json)
}

/**
 * Defensive: extract plain text from a ``page.text_content`` value
 * regardless of whether it's a legacy plain string OR a JSON-shaped
 * TipTap doc.
 *
 * Closes the 4c-B-1 manual-smoke "Finding C" bug: switching a page
 * from a TipTap layout to a Tier-Property layout via the LayoutPicker
 * preserves ``text_content`` (per the Fix A purge-on-switch behavior
 * shipped in v0.34.0, which only purges ``layout_config``). The
 * Tier-Property layout's textarea then renders the raw JSON string
 * as visible text. This helper extracts the plain-text content from
 * any JSON-shaped value before the textarea sees it.
 *
 * Walking strategy: recursively descend ``content`` arrays, harvest
 * every ``text`` field on text-node entries, join paragraph
 * boundaries with newlines. Lossy by design — formatting marks
 * (bold/italic/heading-level/etc.) are dropped, which is the
 * correct shape for the Tier-Property textarea (a small plain
 * input). The TipTap render path on TipTap layouts continues to
 * use ``parseTextContentToJson`` and preserves the full doc.
 *
 * On non-JSON input OR malformed JSON: return the string as-is.
 * The fallback covers legacy plain-text rows + any future shape
 * we haven't anticipated.
 *
 * Filed as a P3 backlog follow-up:
 * PICTURE-BOOK-LAYOUT-SWITCH-TEXT-CONVERSION-01 covers the
 * complementary active-conversion-on-switch path. Defensive read
 * (this helper) handles existing dirty data + every future
 * switch read; active conversion would clean the data at switch
 * time so subsequent reads don't pay the parse cost.
 */
export function extractPlainText(textContent: string | null | undefined): string {
    if (!textContent) return ""
    const trimmed = textContent.trimStart()
    if (!trimmed.startsWith("{")) return textContent
    let parsed: unknown
    try {
        parsed = JSON.parse(textContent)
    } catch {
        return textContent
    }
    if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as {type?: unknown}).type !== "doc"
    ) {
        return textContent
    }
    const pieces: string[] = []
    const walk = (node: unknown): void => {
        if (!node || typeof node !== "object") return
        const n = node as {
            type?: string
            text?: string
            content?: unknown[]
        }
        if (n.type === "text" && typeof n.text === "string") {
            pieces.push(n.text)
            return
        }
        if (Array.isArray(n.content)) {
            const before = pieces.length
            for (const child of n.content) walk(child)
            // Insert a newline between paragraph-shaped children
            // so the textarea preserves visual block boundaries.
            if (n.type === "paragraph" || n.type?.startsWith("heading")) {
                if (pieces.length > before) pieces.push("\n")
            }
        }
    }
    walk(parsed)
    return pieces.join("").replace(/\n+$/, "")
}

interface Props {
    page: Page
    bookId: string
    onUpdate: (updates: PageUpdate) => Promise<void> | void
    /** PB-PHASE4 Session 4c-B-1 Commit 3: D6-C properties-pane
     *  Toolbar placement. PageCanvas mounts the TipTap editor
     *  inline (in the page-region); the Toolbar mounts SEPARATELY
     *  in PageEditor's properties pane. To wire the two, PageCanvas
     *  hands the editor instance UP via this callback. ``null``
     *  signals "active layout is a Tier-Property layout — no
     *  editor instance available" (so the parent unmounts the
     *  Toolbar). Caller MUST treat the editor as scoped to the
     *  current page; on page-switch the parent clears its own
     *  reference + re-receives the new page's editor. */
    onEditorReady?: (editor: Editor | null) => void
}

const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp,image/gif"

function imageUrlFor(bookId: string, assetId: string): string {
    return `/api/books/${bookId}/assets/${assetId}/file`
}

/** 4c-B-2 C1: read-path shim. ``layout_config.bubbles[0]`` takes
 *  precedence over flat top-level keys (legacy fallback). Mirrors
 *  the Python ``_read_bubble_config`` in ``picture_book_pdf.py`` so
 *  in-editor + printed PDF resolve from the same shape. */
function readBubbleConfig(
    config: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
    if (!config) return {}
    const flat: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(config)) {
        if (k !== "bubbles") flat[k] = v
    }
    const bubbles = (config as Record<string, unknown>).bubbles
    const bubblesZero =
        Array.isArray(bubbles) &&
        bubbles.length > 0 &&
        typeof bubbles[0] === "object" &&
        bubbles[0] !== null
            ? (bubbles[0] as Record<string, unknown>)
            : {}
    return {...flat, ...bubblesZero}
}

/** 4c-B-2 C2: parse ``#rrggbb`` / ``rrggbb`` to RGB. Returns
 *  ``null`` for any shape we don't recognise so the caller can
 *  fall back to a default. Mirrors ``_hex_to_rgb`` in
 *  ``picture_book_pdf.py``. */
function hexToRgb(
    hex: unknown,
): {r: number; g: number; b: number} | null {
    if (typeof hex !== "string") return null
    const m = /^#?([a-fA-F0-9]{6})$/.exec(hex.trim())
    if (!m) return null
    const v = parseInt(m[1], 16)
    return {r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff}
}

/** PB-PHASE4 Session 4c Commit 4: derive the speech-bubble's
 *  position + background-opacity inline style from
 *  page.layout_config. Default (NULL config) is bottom-right + full
 *  opacity, matching Session 4 D2a's behavior. */
function speechBubbleInlineStyle(
    config: Record<string, unknown> | null,
): React.CSSProperties {
    // 4c-B-2 C1: read through bubbles[0] wrapper with flat fallback.
    const merged = readBubbleConfig(config)
    // Session 4 D2a default: fallback is bottom-center when no user
    // preset has been picked. The 5 user-pickable presets (TL/TR/BL/
    // BR/CENTER) override this default once persisted.
    const anchor =
        typeof merged.anchor_position === "string"
            ? merged.anchor_position
            : "bottom-center"
    const rawOpacity =
        typeof merged.opacity === "number" ? merged.opacity : 1
    const opacity = Math.max(0.3, Math.min(1, rawOpacity))
    // 4c-B-2 C2: Tier 1 ``background_color`` composes with
    // ``opacity`` into a single rgba() value. Default white keeps
    // pre-C2 pages rendering identically.
    const bgRgb = hexToRgb(merged.background_color) ?? {r: 255, g: 255, b: 255}
    const bg = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${opacity})`
    // PB-PHASE4 Session 4c-B-1 smoke Bug 1 (2026-05-18):
    // bubble_width replaces ``size`` as the canonical width key,
    // bubble_height is the new height knob. Per the user's
    // 2026-05-17 Tier-Property Pre-Inspection adjustment + the
    // 2026-05-18 smoke direct-action: a single ``size`` slider is
    // insufficient — bubbles need independent width + height
    // for picture-book + comic-style use. Backward-compat: read
    // ``size`` as legacy fallback for ``bubble_width`` when the
    // new key is absent; on next write the dispatcher writes
    // ``bubble_width`` so legacy ``size`` fades out without a
    // backfill. ``bubble_height`` has no legacy fallback (new key);
    // defaults to 30%.
    const rawWidth =
        typeof merged.bubble_width === "number"
            ? merged.bubble_width
            : typeof merged.size === "number"
              ? merged.size
              : 40
    const widthPct = Math.max(20, Math.min(80, rawWidth))
    const width = `${widthPct}%`
    const rawHeight =
        typeof merged.bubble_height === "number"
            ? merged.bubble_height
            : 30
    const heightPct = Math.max(15, Math.min(60, rawHeight))
    const height = `${heightPct}%`

    // 4c-B-2 C2: Tier 1 Visual Style. Read border + radius +
    // shadow from the merged bubble config, fall back to the
    // CSS-module defaults (.canvasLayoutSpeechBubble .regionText)
    // when keys are absent. Inline-style wins over the CSS class
    // by specificity, so emitting these properties from C2 onward
    // gives the user full visual control.
    const borderColorRgb = hexToRgb(merged.border_color) ?? {r: 0, g: 0, b: 0}
    const borderColor = `rgb(${borderColorRgb.r}, ${borderColorRgb.g}, ${borderColorRgb.b})`
    const borderWidthRaw =
        typeof merged.border_width === "number" ? merged.border_width : 2
    const borderWidth = Math.max(0, Math.min(8, borderWidthRaw))
    const borderStyleRaw = merged.border_style
    const borderStyle =
        borderStyleRaw === "solid" ||
        borderStyleRaw === "dashed" ||
        borderStyleRaw === "dotted" ||
        borderStyleRaw === "none"
            ? borderStyleRaw
            : "solid"
    const borderRadiusRaw =
        typeof merged.border_radius === "number" ? merged.border_radius : 50
    const borderRadius = `${Math.max(0, Math.min(50, borderRadiusRaw))}%`
    const border = `${borderWidth}px ${borderStyle} ${borderColor}`

    const shadowOn =
        typeof merged.shadow === "boolean" ? merged.shadow : true
    const shadowIntensityRaw =
        typeof merged.shadow_intensity === "number"
            ? merged.shadow_intensity
            : 5
    const shadowIntensity = Math.max(0, Math.min(10, shadowIntensityRaw))
    // Shadow intensity 0-10 maps to a soft drop-shadow:
    // offset_y = intensity/2 px, blur = intensity*2 px, 30% black.
    const boxShadow = shadowOn
        ? `0 ${shadowIntensity / 2}px ${shadowIntensity * 2}px rgba(0, 0, 0, 0.3)`
        : "none"

    // 4c-B-2 C3: Tier 2 Typography. Emitted on the parent
    // ``.region-text`` element; ``.textInput`` inside inherits via
    // the CSS-module override (font-family: inherit etc.). Defaults
    // mirror picture-book conventions (Atkinson Hyperlegible 14pt
    // normal black centered) so pre-C3 pages render identically.
    const fontFamilyRaw = merged.font_family
    const fontFamily =
        typeof fontFamilyRaw === "string" && fontFamilyRaw.length > 0
            ? fontFamilyRaw
            : "Atkinson Hyperlegible"
    const fontSizeRaw =
        typeof merged.font_size === "number" ? merged.font_size : 14
    const fontSize = `${Math.max(10, Math.min(32, fontSizeRaw))}pt`
    const fontWeightRaw = merged.font_weight
    const fontWeight =
        fontWeightRaw === "bold" || fontWeightRaw === "normal"
            ? fontWeightRaw
            : "normal"
    // PADDING-FONT-STYLE-01 C2: italic boolean -> CSS font-style.
    const italic =
        typeof merged.italic === "boolean" ? merged.italic : false
    const fontStyle: "italic" | "normal" = italic ? "italic" : "normal"
    const textColorRgb = hexToRgb(merged.text_color) ?? {r: 0, g: 0, b: 0}
    const textColor = `rgb(${textColorRgb.r}, ${textColorRgb.g}, ${textColorRgb.b})`
    const textAlignRaw = merged.text_align
    const textAlign: "left" | "center" | "right" =
        textAlignRaw === "left" ||
        textAlignRaw === "center" ||
        textAlignRaw === "right"
            ? textAlignRaw
            : "center"

    // PADDING-FONT-STYLE-01 C1: uniform padding emit. Overrides the
    // CSS-module rule ``.canvasLayoutSpeechBubble .regionText {
    // padding: 10px 14px }`` by inline-style specificity. Default
    // 12 px keeps pre-C1 bubbles visually close to the asymmetric
    // 10px / 14px rule (mean-midpoint).
    const paddingRaw =
        typeof merged.padding === "number" ? merged.padding : 12
    const paddingPx = Math.max(0, Math.min(32, paddingRaw))
    const padding = `${paddingPx}px`

    const reset = {top: "auto", right: "auto", bottom: "auto", left: "auto"} as const
    const tier1: React.CSSProperties = {
        background: bg,
        width,
        height,
        border,
        borderRadius,
        boxShadow,
        padding,
        fontFamily,
        fontSize,
        fontWeight,
        fontStyle,
        color: textColor,
        textAlign,
    }
    switch (anchor) {
        case "top-left":
            return {...reset, top: 16, left: 16, transform: "none", ...tier1}
        case "top-center":
            // Session 4c-B-1 manual smoke Finding A: new preset.
            return {
                ...reset,
                top: 16,
                left: "50%",
                transform: "translateX(-50%)",
                ...tier1,
            }
        case "top-right":
            return {...reset, top: 16, right: 16, transform: "none", ...tier1}
        case "middle-left":
            // Session 4c-B-1 manual smoke Finding A: new preset.
            return {
                ...reset,
                top: "50%",
                left: 16,
                transform: "translateY(-50%)",
                ...tier1,
            }
        case "middle-right":
            // Session 4c-B-1 manual smoke Finding A: new preset.
            return {
                ...reset,
                top: "50%",
                right: 16,
                transform: "translateY(-50%)",
                ...tier1,
            }
        case "bottom-left":
            return {...reset, bottom: 16, left: 16, transform: "none", ...tier1}
        case "bottom-right":
            return {...reset, bottom: 16, right: 16, transform: "none", ...tier1}
        case "center":
            return {
                ...reset,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                ...tier1,
            }
        case "bottom-center":
        default:
            return {
                ...reset,
                bottom: 16,
                left: "50%",
                transform: "translateX(-50%)",
                ...tier1,
            }
    }
}

// PB-PHASE4 Session 4 Commit 1: per-layout CSS-Module class. The
// CSS defines grid-template-areas per layout; the JSX stays the
// same (image + text region wrappers) and the styling makes the
// spatial difference visible. Switch-cascade in JSX deliberately
// avoided per coding-standards.md "no if/elif cascades for type".
const LAYOUT_CLASS: Record<PageLayout, string> = {
    speech_bubble: styles.canvasLayoutSpeechBubble,
    image_top_text_bottom: styles.canvasLayoutImageTopTextBottom,
    image_left_text_right: styles.canvasLayoutImageLeftTextRight,
    image_full_text_overlay: styles.canvasLayoutImageFullTextOverlay,
    text_only: styles.canvasLayoutTextOnly,
    // Comic-book layout. PageCanvas is the picture-book canvas; it
    // never renders a comic_book page (those go through
    // ComicPanelGrid). Fallback to image_top_text_bottom styling so
    // the Record stays exhaustive without introducing an unused CSS
    // class. Reached only via the ``LAYOUT_CLASS[page.layout] ?? …``
    // safety net, never in practice.
    comic_panel_grid: styles.canvasLayoutImageTopTextBottom,
}

export default function PageCanvas({page, bookId, onUpdate, onEditorReady}: Props) {
    const {t} = useI18n()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState<string | null>(null)
    // PB-PHASE4 Session 4c-B-1 fix C: defensive plain-text
    // extraction. Switching a page from a TipTap layout to a
    // Tier-Property layout preserves text_content (per v0.34.0
    // Fix A which only purges layout_config). The textarea then
    // renders whatever string is there; without this defense,
    // a JSON-shaped string from the prior TipTap edits would
    // display literally. extractPlainText handles both legacy
    // plain text AND JSON-shaped strings transparently.
    const [textDraft, setTextDraft] = useState(() =>
        extractPlainText(page.text_content),
    )
    // PB-PHASE4 Session 4c-B-1 Commit 2: per-layout TipTap state.
    // TIPTAP_LAYOUTS render through RichTextEditor; their content
    // is a parsed JSONContent (legacy plain text auto-wraps on
    // read per D4 backward-compat). The non-TipTap layouts keep
    // using textDraft above.
    const [textJson, setTextJson] = useState<JSONContent | null>(() =>
        parseTextContentToJson(page.text_content),
    )

    useEffect(() => {
        setTextDraft(extractPlainText(page.text_content))
        setTextJson(parseTextContentToJson(page.text_content))
        setUploadError(null)
    }, [page.id, page.text_content])

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        setUploadError(null)
        try {
            const asset = await api.assets.upload(bookId, file, "figure")
            await onUpdate({image_asset_id: asset.id})
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : String(err))
        } finally {
            setUploading(false)
            if (fileInputRef.current) fileInputRef.current.value = ""
        }
    }

    const handleTextBlur = async () => {
        const trimmed = textDraft
        const original = page.text_content ?? ""
        if (trimmed === original) return
        await onUpdate({text_content: trimmed.length === 0 ? null : trimmed})
    }

    /**
     * PB-PHASE4 Session 4c-B-1 Commit 2: persist TipTap JSON.
     *
     * Fires on every TipTap onChange tick (every keystroke).
     * Debounced 800 ms so the API isn't hammered — matches the
     * existing chapter-editor autosave cadence (Editor.tsx).
     * The serialized JSON string lands in ``page.text_content``;
     * the per-layout discriminator on read (parseTextContentToJson)
     * decodes it back on the next mount / page-switch.
     *
     * Empty doc (no content nodes) is normalised to ``null`` so
     * the empty-page case matches the legacy textarea behavior.
     *
     * No-op guard: if the serialized value equals what's already
     * in ``page.text_content``, skip the API call entirely. Catches
     * the mount-time onChange that TipTap's React adapter fires
     * during the editor's initial transaction (observed in
     * happy-dom during 4c-B-1 Commit 2 test development) — and
     * any other "user typed → backspaced → exactly back to the
     * persisted state" edge.
     */
    const persistTextJson = useCallback(
        async (next: JSONContent | null): Promise<void> => {
            // Detect "doc with no text" and persist as null so an
            // emptied-out page reads back as empty on next mount.
            const serialized = (() => {
                if (!next) return null
                const docHasText = JSON.stringify(next).includes('"text"')
                if (!docHasText) return null
                return serializeJsonToText(next)
            })()
            if (serialized === page.text_content) return
            await onUpdate({text_content: serialized})
        },
        [onUpdate, page.text_content],
    )

    const persistTextJsonDebounced = useDebouncedCallback(
        persistTextJson,
        800,
    )

    const handleRichTextChange = useCallback(
        (next: JSONContent) => {
            setTextJson(next)
            persistTextJsonDebounced(next)
        },
        [persistTextJsonDebounced],
    )

    /**
     * PB-PHASE4 Session 4c-B-1 Commit 3: signal "no editor"
     * to the parent when the active layout is a Tier-Property
     * layout (so the properties-pane Toolbar unmounts). For
     * TipTap layouts, the RichTextEditor below fires
     * onEditorReady with the actual instance directly to the
     * parent through the prop pass-through.
     */
    useEffect(() => {
        if (!onEditorReady) return
        if (!isTipTapLayout(page.layout as PageLayout)) {
            onEditorReady(null)
        }
    }, [page.layout, onEditorReady])

    const hasImage = Boolean(page.image_asset_id)
    const layoutClass = LAYOUT_CLASS[page.layout as PageLayout] ?? LAYOUT_CLASS.image_top_text_bottom
    const isSpeechBubble = page.layout === "speech_bubble"
    const isTextOnly = page.layout === "text_only"
    // Fix B (4c-B sub-item): extract the active layout's namespace
    // before reading per-key fields. Legacy-flat configs return the
    // whole dict (transparent backward-compat). Namespaced configs
    // return the layout's own bucket; sibling-layout namespaces are
    // invisible to this layout's renderer.
    const layoutNamespace = readLayoutNamespace(
        page.layout_config,
        page.layout as PageLayout,
    )
    const speechBubbleStyle = isSpeechBubble
        ? speechBubbleInlineStyle(layoutNamespace)
        : undefined

    // Session 4c Commit 5: image_top_text_bottom +
    // image_left_text_right + image_full_text_overlay configs.
    const layoutConfig = layoutNamespace ?? {}
    const imagePosition =
        typeof layoutConfig.image_position === "string" &&
        ["left", "center", "right"].includes(layoutConfig.image_position as string)
            ? (layoutConfig.image_position as "left" | "center" | "right")
            : "center"
    const imageFit =
        typeof layoutConfig.image_fit === "string" &&
        ["contain", "cover"].includes(layoutConfig.image_fit as string)
            ? (layoutConfig.image_fit as "contain" | "cover")
            : page.layout === "speech_bubble"
              ? "cover"
              : "contain"
    const splitRatio =
        typeof layoutConfig.split_ratio === "number"
            ? Math.max(50, Math.min(70, layoutConfig.split_ratio as number))
            : 60
    const textPosition =
        typeof layoutConfig.text_position === "string" &&
        ["top", "middle", "bottom"].includes(layoutConfig.text_position as string)
            ? (layoutConfig.text_position as "top" | "middle" | "bottom")
            : "bottom"
    const textBackdropOpacity =
        typeof layoutConfig.text_backdrop_opacity === "number"
            ? Math.max(0.3, Math.min(0.8, layoutConfig.text_backdrop_opacity as number))
            : 0.45

    // Compute the inline style for non-speech-bubble layouts.
    const canvasInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_left_text_right") {
        canvasInlineStyle.gridTemplateColumns = `${splitRatio}% ${100 - splitRatio}%`
    }
    const regionImageInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_top_text_bottom") {
        if (imagePosition === "left") regionImageInlineStyle.justifyContent = "flex-start"
        else if (imagePosition === "right") regionImageInlineStyle.justifyContent = "flex-end"
        else regionImageInlineStyle.justifyContent = "center"
    }
    const imageInlineStyle: React.CSSProperties = {}
    if (page.layout === "image_top_text_bottom" || page.layout === "image_left_text_right") {
        imageInlineStyle.objectFit = imageFit
    }
    const overlayTextStyle: React.CSSProperties = {}
    if (page.layout === "image_full_text_overlay") {
        // PICTURE-BOOK-OVERLAY-TEXT-TIER-PROPERTIES-01 +
        // PICTURE-BOOK-TEXT-CONFIGURATION-01 Session 1 C5: read
        // Tier 1+2 Visual-Style + Typography from the overlay
        // namespace and emit per-field overrides. Defaults match
        // the pre-C5 hardcoded styling so legacy pages render
        // identically (background dark #000 + 0.45 opacity, no
        // border, no shadow, no custom font / weight / color /
        // align, padding inherited from CSS module).
        const tierConfig = layoutConfig as Record<string, unknown>

        // Background composition: hex background_color × the
        // existing text_backdrop_opacity slider. Default
        // background_color is #000000 (black) so legacy pages
        // behave identically; setting any color (e.g. #FFC857 sunny)
        // tints the overlay backdrop without losing the opacity
        // dimension.
        const bgRgb = hexToRgb(tierConfig.background_color) ?? {r: 0, g: 0, b: 0}
        overlayTextStyle.background = `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, ${textBackdropOpacity})`

        // Tier 1 — border + radius + shadow + padding.
        const borderColorRgb =
            hexToRgb(tierConfig.border_color) ?? {r: 0, g: 0, b: 0}
        const borderWidthRaw =
            typeof tierConfig.border_width === "number"
                ? tierConfig.border_width
                : 0
        const borderWidth = Math.max(0, Math.min(8, borderWidthRaw))
        const borderStyleRaw = tierConfig.border_style
        const borderStyle =
            borderStyleRaw === "solid" ||
            borderStyleRaw === "dashed" ||
            borderStyleRaw === "dotted" ||
            borderStyleRaw === "none"
                ? borderStyleRaw
                : "none"
        if (borderWidth > 0 && borderStyle !== "none") {
            overlayTextStyle.border = `${borderWidth}px ${borderStyle} rgb(${borderColorRgb.r}, ${borderColorRgb.g}, ${borderColorRgb.b})`
        }
        const borderRadiusRaw =
            typeof tierConfig.border_radius === "number"
                ? tierConfig.border_radius
                : 0
        if (borderRadiusRaw > 0) {
            overlayTextStyle.borderRadius = `${Math.max(0, Math.min(50, borderRadiusRaw))}%`
        }
        const shadowOn =
            typeof tierConfig.shadow === "boolean" ? tierConfig.shadow : false
        if (shadowOn) {
            const shadowIntensityRaw =
                typeof tierConfig.shadow_intensity === "number"
                    ? tierConfig.shadow_intensity
                    : 5
            const shadowIntensity = Math.max(0, Math.min(10, shadowIntensityRaw))
            overlayTextStyle.boxShadow = `0 ${shadowIntensity / 2}px ${shadowIntensity * 2}px rgba(0, 0, 0, 0.3)`
        }
        const paddingRaw =
            typeof tierConfig.padding === "number" ? tierConfig.padding : undefined
        if (typeof paddingRaw === "number") {
            overlayTextStyle.padding = `${Math.max(0, Math.min(32, paddingRaw))}px`
        }

        // Tier 2 — typography. Each control overrides the
        // CSS-module default by inline specificity; absent values
        // leave the CSS-module default in place.
        if (typeof tierConfig.font_family === "string" && tierConfig.font_family.length > 0) {
            overlayTextStyle.fontFamily = tierConfig.font_family
        }
        if (typeof tierConfig.font_size === "number") {
            overlayTextStyle.fontSize = `${Math.max(10, Math.min(32, tierConfig.font_size))}pt`
        }
        if (tierConfig.font_weight === "bold" || tierConfig.font_weight === "normal") {
            overlayTextStyle.fontWeight = tierConfig.font_weight
        }
        if (typeof tierConfig.italic === "boolean") {
            overlayTextStyle.fontStyle = tierConfig.italic ? "italic" : "normal"
        }
        const textColorRgb = hexToRgb(tierConfig.text_color)
        if (textColorRgb) {
            overlayTextStyle.color = `rgb(${textColorRgb.r}, ${textColorRgb.g}, ${textColorRgb.b})`
        }
        if (
            tierConfig.text_align === "left" ||
            tierConfig.text_align === "center" ||
            tierConfig.text_align === "right"
        ) {
            overlayTextStyle.textAlign = tierConfig.text_align
        }

        // Positioning (unchanged from pre-C5). Use individual
        // properties (not `inset` shorthand) so the serialized
        // inline style is testable in jsdom.
        overlayTextStyle.left = 0
        overlayTextStyle.right = 0
        if (textPosition === "top") {
            overlayTextStyle.top = 0
            overlayTextStyle.bottom = "auto"
        } else if (textPosition === "middle") {
            overlayTextStyle.top = "50%"
            overlayTextStyle.bottom = "auto"
            overlayTextStyle.transform = "translateY(-50%)"
            overlayTextStyle.maxHeight = "70%"
        } else {
            overlayTextStyle.top = "auto"
            overlayTextStyle.bottom = 0
        }
    }

    return (
        <div className={styles.canvasWrapper} data-testid="page-canvas-wrapper">
            <div
                data-testid="page-canvas-root"
                data-page-id={page.id}
                data-layout={page.layout}
                data-image-position={
                    page.layout === "image_top_text_bottom" ? imagePosition : undefined
                }
                data-image-fit={
                    page.layout === "image_top_text_bottom" ||
                    page.layout === "image_left_text_right"
                        ? imageFit
                        : undefined
                }
                data-split-ratio={
                    page.layout === "image_left_text_right" ? splitRatio : undefined
                }
                data-text-position={
                    page.layout === "image_full_text_overlay" ? textPosition : undefined
                }
                className={`${styles.canvas} ${layoutClass}`}
                style={canvasInlineStyle}
            >
                {!isTextOnly && (
                    <div
                        data-testid="page-canvas-image-area"
                        data-region="image"
                        className={`${styles.region} ${styles.regionImage}`}
                        style={regionImageInlineStyle}
                    >
                        {hasImage ? (
                            <img
                                key={page.image_asset_id ?? ""}
                                src={imageUrlFor(bookId, page.image_asset_id!)}
                                alt=""
                                className={styles.image}
                                style={imageInlineStyle}
                                data-testid="page-canvas-image"
                            />
                        ) : (
                            <div
                                className={styles.imagePlaceholder}
                                data-testid="page-canvas-image-placeholder"
                            >
                                <ImageIcon size={40} aria-hidden />
                                <span>
                                    {t("ui.page_editor.no_image", "No image yet")}
                                </span>
                            </div>
                        )}
                        {/* Session 4c D2: on-image hover overlay for the
                         *  upload/replace action. Notion-style top-right
                         *  toolbar. Visible on hover (mouseenter on
                         *  .regionImage) + on focus-within so keyboard
                         *  users can tab into the action. Replaces the
                         *  bottom-bar .imageActions row entirely. */}
                        <button
                            type="button"
                            className={styles.imageReplaceBtn}
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            data-testid="page-canvas-image-replace"
                            title={
                                hasImage
                                    ? t(
                                          "ui.page_editor.replace_image",
                                          "Replace image",
                                      )
                                    : t(
                                          "ui.page_editor.upload_image",
                                          "Upload image",
                                      )
                            }
                            aria-label={
                                hasImage
                                    ? t(
                                          "ui.page_editor.replace_image",
                                          "Replace image",
                                      )
                                    : t(
                                          "ui.page_editor.upload_image",
                                          "Upload image",
                                      )
                            }
                        >
                            {uploading ? (
                                <span className={styles.imageReplaceLabel}>
                                    {t("ui.page_editor.uploading", "Uploading...")}
                                </span>
                            ) : hasImage ? (
                                <RefreshCw size={14} />
                            ) : (
                                <Upload size={14} />
                            )}
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPT}
                            onChange={handleFileChange}
                            className={styles.fileInput}
                            data-testid="page-canvas-file-input"
                        />
                    </div>
                )}
                <div
                    data-testid={
                        isSpeechBubble
                            ? "page-canvas-speech-bubble"
                            : "page-canvas-region-text"
                    }
                    data-region="text"
                    data-anchor={
                        isSpeechBubble
                            ? ((readBubbleConfig(
                                  layoutNamespace,
                              ).anchor_position as string) ?? "bottom-center")
                            : undefined
                    }
                    className={`${styles.region} ${styles.regionText}`}
                    style={
                        isSpeechBubble
                            ? speechBubbleStyle
                            : page.layout === "image_full_text_overlay"
                              ? overlayTextStyle
                              : undefined
                    }
                >
                    {isTipTapLayout(page.layout as PageLayout) ? (
                        <RichTextEditor
                            content={textJson}
                            onChange={handleRichTextChange}
                            onEditorReady={onEditorReady}
                            placeholder={t(
                                "ui.page_editor.text_placeholder",
                                "Write the page text here...",
                            )}
                            testidNamespace={`page-canvas-richtext-${page.id}`}
                            className={styles.textInput}
                        />
                    ) : (
                        <textarea
                            id={`page-canvas-text-${page.id}`}
                            className={styles.textInput}
                            value={textDraft}
                            onChange={(e) => setTextDraft(e.target.value)}
                            onBlur={handleTextBlur}
                            placeholder={t(
                                "ui.page_editor.text_placeholder",
                                "Write the page text here...",
                            )}
                            data-testid="page-canvas-text-input"
                        />
                    )}
                </div>
            </div>
            {uploadError && (
                <div
                    className={styles.uploadError}
                    role="alert"
                    data-testid="page-canvas-upload-error"
                >
                    {uploadError}
                </div>
            )}
        </div>
    )
}
