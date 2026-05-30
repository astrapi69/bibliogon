import {useState} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {Sparkles, Download, X} from "lucide-react"
import {useI18n} from "../hooks/useI18n"
import {RadixSelect} from "./RadixSelect"
import {notify} from "../utils/notify"
import {api, ApiError, type Article, type Book} from "../api/client"
import TemplateImportDropZone, {
    TemplateImportFilePreview,
} from "./TemplateImportDropZone"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 4/10 (article variant).
//
// "New from template" dashboard button that orchestrates the empty-
// template workflow:
//
//   1. Download an empty .biblio.yaml in the chosen language
//   2. Fill it externally (AI / human / hybrid)
//   3. Upload the filled YAML back here
//   4. Backend creates a fresh Article/Book and returns the row
//   5. Parent navigates to the new record's editor
//
// The book variant ships in commit 5; the component is already
// kind-aware so it just needs the book backend endpoint to wire up.

export type NewFromTemplateKind = "article" | "book"

interface Props {
    kind: NewFromTemplateKind
    /** Called with the newly-created record. Parent owns the
     *  post-create navigation. */
    onCreated: (created: Article | Book) => void
    /** Initial language for the empty-template download. The user
     *  can change it in the dialog. Defaults to "en". */
    defaultLanguage?: string
    /** Optional class for the trigger button so dashboard headers
     *  can size + colour it consistently with the existing "New"
     *  primary button. */
    triggerClassName?: string
    /** Test-id override for the trigger button. */
    triggerTestId?: string
}

const LANGUAGES = ["de", "en", "es", "fr", "el", "pt", "tr", "ja"] as const

export default function NewFromTemplateButton({
    kind,
    onCreated,
    defaultLanguage = "en",
    triggerClassName = "btn btn-secondary btn-sm",
    triggerTestId,
}: Props) {
    const {t} = useI18n()
    const [open, setOpen] = useState(false)
    const [language, setLanguage] = useState(defaultLanguage)
    const [file, setFile] = useState<File | null>(null)
    const [downloading, setDownloading] = useState(false)
    const [creating, setCreating] = useState(false)

    const namespace = kind === "article" ? api.articles : api.books

    const handleDownloadEmpty = async () => {
        setDownloading(true)
        try {
            const {blob, filename} = await namespace.aiTemplate.empty(language)
            const url = URL.createObjectURL(blob)
            const link = document.createElement("a")
            link.href = url
            link.download = filename
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
            notify.success(
                t(
                    "ui.ai_template.new_from_template.download_success",
                    "Empty template downloaded: {filename}",
                ).replace("{filename}", filename),
            )
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.ai_template.new_from_template.download_error",
                          "Failed to download empty template",
                      )
            notify.error(detail, err)
        } finally {
            setDownloading(false)
        }
    }

    const handleSubmit = async () => {
        if (!file) return
        setCreating(true)
        try {
            const yamlText = await file.text()
            const created =
                kind === "article"
                    ? ((await api.articles.fromAiTemplate(yamlText)) as Article)
                    : ((await api.books.fromAiTemplate(yamlText)) as Book)
            notify.success(
                t(
                    "ui.ai_template.new_from_template.create_success",
                    "Created from template: {title}",
                ).replace("{title}", created.title),
            )
            setOpen(false)
            setFile(null)
            onCreated(created)
        } catch (err) {
            const detail =
                err instanceof ApiError
                    ? err.detail
                    : t(
                          "ui.ai_template.new_from_template.create_error",
                          "Could not create from template",
                      )
            notify.error(detail, err)
        } finally {
            setCreating(false)
        }
    }

    return (
        <>
            <button
                type="button"
                className={triggerClassName}
                onClick={() => setOpen(true)}
                data-testid={triggerTestId ?? `new-from-template-${kind}`}
            >
                <Sparkles size={14} style={{marginRight: 6}}/>
                {t("ui.ai_template.new_from_template.button", "New from template")}
            </button>

            <Dialog.Root
                open={open}
                onOpenChange={(o) => {
                    if (!o) {
                        setOpen(false)
                        setFile(null)
                    }
                }}
            >
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay"/>
                    <Dialog.Content
                        className="dialog-content dialog-content-wide"
                        data-testid="new-from-template-dialog"
                        onEscapeKeyDown={() => setOpen(false)}
                    >
                        <div className="dialog-header">
                            <Dialog.Title className="dialog-title">
                                {t(
                                    "ui.ai_template.new_from_template.dialog_title",
                                    "New from template",
                                )}
                            </Dialog.Title>
                            <Dialog.Close asChild>
                                <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => setOpen(false)}
                                    aria-label={t("ui.common.close", "Schließen")}
                                >
                                    <X size={16}/>
                                </button>
                            </Dialog.Close>
                        </div>
                        <Dialog.Description className="dialog-message">
                            {t(
                                "ui.ai_template.new_from_template.description",
                                "Download an empty template, fill it, then upload the result.",
                            )}
                        </Dialog.Description>

                        {/* Step 1: download an empty template */}
                        <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                background: "var(--surface-2, #f5f5f5)",
                                borderRadius: 6,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <div style={{fontWeight: 600, fontSize: "0.875rem"}}>
                                1. {t(
                                    "ui.ai_template.new_from_template.step1",
                                    "Download an empty template",
                                )}
                            </div>
                            <div
                                style={{display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center"}}
                            >
                                <label style={{display: "flex", alignItems: "center", gap: 6}}>
                                    <span>{t("ui.ai_template.new_from_template.language", "Language")}:</span>
                                    <RadixSelect
                                        value={language}
                                        onValueChange={setLanguage}
                                        testId="new-from-template-language"
                                        ariaLabel={t("ui.ai_template.new_from_template.language", "Language")}
                                        disabled={downloading}
                                        className="is-narrow"
                                        options={LANGUAGES.map((l) => ({value: l, label: l}))}
                                    />
                                </label>
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={handleDownloadEmpty}
                                    disabled={downloading}
                                    data-testid="new-from-template-download"
                                >
                                    <Download size={14} style={{marginRight: 6}}/>
                                    {t(
                                        "ui.ai_template.new_from_template.download_button",
                                        "Download empty template",
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Step 2: upload the filled template */}
                        <div
                            style={{
                                marginTop: 12,
                                padding: 12,
                                background: "var(--surface-2, #f5f5f5)",
                                borderRadius: 6,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}
                        >
                            <div style={{fontWeight: 600, fontSize: "0.875rem"}}>
                                2. {t(
                                    "ui.ai_template.new_from_template.step2",
                                    "Upload the filled template",
                                )}
                            </div>
                            <TemplateImportDropZone
                                mode="single"
                                onFile={setFile}
                                loading={creating}
                            />
                            {file && <TemplateImportFilePreview file={file}/>}
                        </div>

                        <div className="dialog-footer" style={{marginTop: 16}}>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setOpen(false)}
                                disabled={creating}
                                data-testid="new-from-template-cancel"
                            >
                                {t("ui.common.cancel", "Abbrechen")}
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={!file || creating}
                                data-testid="new-from-template-submit"
                            >
                                {t(
                                    "ui.ai_template.new_from_template.submit",
                                    "Create",
                                )}
                            </button>
                        </div>
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    )
}
