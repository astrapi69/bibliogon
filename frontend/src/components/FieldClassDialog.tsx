import {useState, useEffect, useCallback} from "react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import {X} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import type {AiFillRequest} from "../api/client"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 2/10.
//
// Modal dialog used by the AITemplatePanel "Fill with AI" button
// (commit 3) and by the bulk-fill confirm dialog (commit 8). Renders
// checkboxes for the available field-classes (article vs. book),
// the force-override toggle, and - for article + image_prompts - an
// optional override of the inline image count.
//
// Submit builds an ``AiFillRequest`` and hands it to the parent;
// the parent owns the actual API call so the dialog stays unaware
// of toast/error handling.

export type FieldClassKind = "article" | "book"

export interface FieldClassDialogResult {
    field_classes: string[]
    force: boolean
    inline_image_count?: number | null
}

interface Props {
    open: boolean
    onClose: () => void
    onSubmit: (request: FieldClassDialogResult) => void
    /** Drives the available field-class list. */
    kind: FieldClassKind
    /** Optional whitelist of field-class ids to offer. When set, only
     *  these classes render (used offline, where only the field-classes
     *  whose targets exist on the Dexie/API shape are supported). When
     *  omitted, all classes for the kind are shown. */
    availableClasses?: string[]
    /** Disables the submit button while the parent runs the action.
     *  The dialog stays open during submission so the parent can
     *  close it on success or leave it open on error. */
    loading?: boolean
    /** Title text shown in the dialog header. The default fits the
     *  per-record "Fill with AI" workflow; the bulk-fill confirm
     *  dialog overrides this with its own copy. */
    title?: string
    /** Submit-button label. Defaults to "Fill with AI". */
    submitLabel?: string
}

// Field-class definitions kept in-component because each carries
// human-readable copy (description + which columns it touches). The
// i18n keys default-fall-back to English so the dialog renders
// before a catalog string is added.

interface ClassDef {
    id: string
    labelKey: string
    labelFallback: string
    descKey: string
    descFallback: string
    /** Comma-separated column hint shown under the label. */
    targetsKey: string
    targetsFallback: string
}

const ARTICLE_CLASSES: ClassDef[] = [
    {
        id: "seo",
        labelKey: "ui.ai_template.field_class.seo.label",
        labelFallback: "SEO",
        descKey: "ui.ai_template.field_class.seo.desc",
        descFallback:
            "SEO title (max 60 chars) and meta description (150-160 chars).",
        targetsKey: "ui.ai_template.field_class.seo.targets",
        targetsFallback: "seo_title, seo_description",
    },
    {
        id: "tags",
        labelKey: "ui.ai_template.field_class.tags.label",
        labelFallback: "Tags",
        descKey: "ui.ai_template.field_class.tags.desc",
        descFallback:
            "5-10 lowercase tags reflecting the article's topics.",
        targetsKey: "ui.ai_template.field_class.tags.targets",
        targetsFallback: "tags",
    },
    {
        id: "topic",
        labelKey: "ui.ai_template.field_class.topic.label",
        labelFallback: "Topic",
        descKey: "ui.ai_template.field_class.topic.desc",
        descFallback: "One-word or short-phrase primary topic.",
        targetsKey: "ui.ai_template.field_class.topic.targets",
        targetsFallback: "topic",
    },
    {
        id: "excerpt",
        labelKey: "ui.ai_template.field_class.excerpt.label",
        labelFallback: "Excerpt",
        descKey: "ui.ai_template.field_class.excerpt.desc",
        descFallback:
            "200-300 character conversational summary for the article list.",
        targetsKey: "ui.ai_template.field_class.excerpt.targets",
        targetsFallback: "excerpt",
    },
    {
        id: "image_prompts",
        labelKey: "ui.ai_template.field_class.image_prompts.label",
        labelFallback: "Image prompts",
        descKey: "ui.ai_template.field_class.image_prompts.desc",
        descFallback:
            "Stable-Diffusion-style prompts: one hero + one per H2 section.",
        targetsKey: "ui.ai_template.field_class.image_prompts.targets",
        targetsFallback: "featured_image_prompt, inline_image_prompts",
    },
]

const BOOK_CLASSES: ClassDef[] = [
    {
        id: "marketing_copy",
        labelKey: "ui.ai_template.field_class.marketing_copy.label",
        labelFallback: "Marketing copy",
        descKey: "ui.ai_template.field_class.marketing_copy.desc",
        descFallback:
            "Back-cover description + author bio + Amazon HTML description.",
        targetsKey: "ui.ai_template.field_class.marketing_copy.targets",
        targetsFallback:
            "backpage_description, backpage_author_bio, html_description",
    },
    {
        id: "tags",
        labelKey: "ui.ai_template.field_class.book_tags.label",
        labelFallback: "Keywords",
        descKey: "ui.ai_template.field_class.book_tags.desc",
        descFallback: "5-10 marketplace keywords.",
        targetsKey: "ui.ai_template.field_class.book_tags.targets",
        targetsFallback: "keywords",
    },
    {
        id: "description_genre",
        labelKey: "ui.ai_template.field_class.description_genre.label",
        labelFallback: "Description & genre",
        descKey: "ui.ai_template.field_class.description_genre.desc",
        descFallback: "Internal description and primary genre.",
        targetsKey: "ui.ai_template.field_class.description_genre.targets",
        targetsFallback: "description, genre",
    },
    {
        id: "cover_prompt",
        labelKey: "ui.ai_template.field_class.cover_prompt.label",
        labelFallback: "Cover prompt",
        descKey: "ui.ai_template.field_class.cover_prompt.desc",
        descFallback: "Stable-Diffusion-style prompt for the book cover.",
        targetsKey: "ui.ai_template.field_class.cover_prompt.targets",
        targetsFallback: "cover_image_prompt",
    },
    {
        id: "chapter_summaries",
        labelKey: "ui.ai_template.field_class.chapter_summaries.label",
        labelFallback: "Chapter summaries",
        descKey: "ui.ai_template.field_class.chapter_summaries.desc",
        descFallback:
            "One-sentence summary per existing chapter, matched by chapter id.",
        targetsKey: "ui.ai_template.field_class.chapter_summaries.targets",
        targetsFallback: "chapter_summaries",
    },
]

export default function FieldClassDialog({
    open,
    onClose,
    onSubmit,
    kind,
    availableClasses,
    loading = false,
    title,
    submitLabel,
}: Props) {
    const {t} = useI18n()
    const allClasses = kind === "article" ? ARTICLE_CLASSES : BOOK_CLASSES
    const classes = availableClasses
        ? allClasses.filter((cls) => availableClasses.includes(cls.id))
        : allClasses

    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [force, setForce] = useState(false)
    const [inlineImageCount, setInlineImageCount] = useState<number | null>(null)

    // Reset state when the dialog opens. Closing carries state away
    // because the parent unmounts the dialog; opening fresh next
    // time should not show the previous selection.
    useEffect(() => {
        if (open) {
            setSelected(new Set())
            setForce(false)
            setInlineImageCount(null)
        }
    }, [open])

    const toggle = useCallback((id: string) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }, [])

    const handleSubmit = () => {
        const fieldClasses = Array.from(selected)
        if (fieldClasses.length === 0) return
        const result: FieldClassDialogResult = {
            field_classes: fieldClasses,
            force,
        }
        // inline_image_count only applies to article + image_prompts;
        // the backend ignores it for books, but we omit it cleanly so
        // the request body stays minimal.
        if (kind === "article" && selected.has("image_prompts") && inlineImageCount !== null) {
            result.inline_image_count = inlineImageCount
        }
        onSubmit(result)
    }

    const showInlineCount =
        kind === "article" && selected.has("image_prompts")

    const dialogTitle =
        title ?? t("ui.ai_template.fill_dialog.title", "Fill with AI")
    const submitText =
        submitLabel ?? t("ui.ai_template.fill_dialog.submit", "Fill with AI")
    const canSubmit = selected.size > 0 && !loading

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent
                size="wide"
                data-testid="field-class-dialog"
                onEscapeKeyDown={onClose}
            >
                    <DialogHeader>
                        <DialogTitle>{dialogTitle}</DialogTitle>
                        <DialogClose asChild>
                            <button
                                className="btn-icon"
                                onClick={onClose}
                                aria-label={t("ui.common.close", "Schließen")}
                            >
                                <X size={16}/>
                            </button>
                        </DialogClose>
                    </DialogHeader>

                    <DialogDescription>
                        {t(
                            "ui.ai_template.fill_dialog.description",
                            "Select which field-classes the AI should fill. Each class is one LLM call.",
                        )}
                    </DialogDescription>

                    <div
                        style={{display: "flex", flexDirection: "column", gap: 8, marginTop: 12}}
                        data-testid="field-class-list"
                    >
                        {classes.map((cls) => {
                            const checked = selected.has(cls.id)
                            return (
                                <label
                                    key={cls.id}
                                    className="checkbox-row"
                                    data-testid={`field-class-${cls.id}`}
                                    style={{display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0"}}
                                >
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(cls.id)}
                                        data-testid={`field-class-checkbox-${cls.id}`}
                                        style={{marginTop: 3}}
                                    />
                                    <div style={{display: "flex", flexDirection: "column", gap: 2}}>
                                        <div style={{fontWeight: 600}}>{t(cls.labelKey, cls.labelFallback)}</div>
                                        <div style={{fontSize: "0.875rem", color: "var(--text-muted, #666)"}}>
                                            {t(cls.descKey, cls.descFallback)}
                                        </div>
                                        <div style={{fontSize: "0.75rem", fontFamily: "monospace", color: "var(--text-muted, #888)"}}>
                                            {t(cls.targetsKey, cls.targetsFallback)}
                                        </div>
                                    </div>
                                </label>
                            )
                        })}
                    </div>

                    {showInlineCount && (
                        <div style={{marginTop: 12, padding: "8px 12px", background: "var(--surface-2, #f5f5f5)", borderRadius: 6}}>
                            <label style={{display: "flex", alignItems: "center", gap: 8}}>
                                <span>
                                    {t(
                                        "ui.ai_template.fill_dialog.inline_image_count",
                                        "Inline image prompts (override)",
                                    )}
                                </span>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={inlineImageCount ?? ""}
                                    placeholder={t(
                                        "ui.ai_template.fill_dialog.inline_image_count_auto",
                                        "auto (h2 count, max 5)",
                                    )}
                                    onChange={(e) => {
                                        const v = e.target.value
                                        setInlineImageCount(v ? Math.max(1, Math.min(10, Number(v))) : null)
                                    }}
                                    data-testid="field-class-inline-count"
                                    style={{width: 80}}
                                />
                            </label>
                        </div>
                    )}

                    <div style={{marginTop: 16, padding: "8px 12px", background: "var(--surface-2, #f5f5f5)", borderRadius: 6}}>
                        <label style={{display: "flex", alignItems: "center", gap: 8}}>
                            <input
                                type="checkbox"
                                checked={force}
                                onChange={(e) => setForce(e.target.checked)}
                                data-testid="field-class-force"
                            />
                            <span>
                                <div>{t("ui.ai_template.fill_dialog.force", "Overwrite existing values")}</div>
                                <div style={{fontSize: "0.75rem", color: "var(--text-muted, #666)"}}>
                                    {t(
                                        "ui.ai_template.fill_dialog.force_hint",
                                        "Without this, fields that already have a value stay unchanged.",
                                    )}
                                </div>
                            </span>
                        </label>
                    </div>

                    <DialogFooter sticky>
                        <button
                            className="btn btn-ghost"
                            onClick={onClose}
                            disabled={loading}
                            data-testid="field-class-cancel"
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            data-testid="field-class-submit"
                        >
                            {submitText}
                        </button>
                    </DialogFooter>
                </DialogContent>
        </Dialog>
    )
}
