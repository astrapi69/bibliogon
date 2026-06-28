import {
    BookCreate,
    BookFromTemplateCreate,
    BookType,
} from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import AuthorSelectInput from "../shared/AuthorSelectInput";
import * as Tabs from "@radix-ui/react-tabs";
import styles from "../CreateBookForm.module.css";
import { useCreateBookForm } from "./create-form/useCreateBookForm";
import { TemplatePickerTab } from "./create-form/TemplatePickerTab";
import { OptionalDetailsSection } from "./create-form/OptionalDetailsSection";

type Mode = "blank" | "template";

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
 * per-type title, and the create/navigate handlers.
 *
 * Issue #677 moves the state/effects/handlers into useCreateBookForm and
 * the template-picker + optional-fields JSX into create-form/ sub-
 * components; this file is the thin shell that wires them together.
 */
export default function CreateBookForm({
    onCreate,
    onCreateFromTemplate,
    onCancel,
    bookType = "prose",
}: Props) {
    const { t } = useI18n();
    const form = useCreateBookForm({ onCreate, onCreateFromTemplate, bookType });

    return (
        <div>
            <Tabs.Root
                value={form.mode}
                onValueChange={(v) => form.setMode(v as Mode)}
            >
                {/* BOOK-TYPES-SSOT-YAML-01 C6: tab visibility driven by
                 *  capabilities.template_catalog flag in book-types.yaml.
                 *  Offline (Dexie) mode also hides the switcher — templates are
                 *  backend-only, so the form shows directly with no empty tab. */}
                {form.showTemplateTabs && (
                    <Tabs.List className="radix-tabs-list" style={{ marginBottom: 12 }}>
                        <Tabs.Trigger
                            value="blank"
                            className="radix-tab-trigger"
                            data-testid="create-book-mode-blank"
                        >
                            {t("ui.create_book.mode_blank", "Neu erstellen")}
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

                <TemplatePickerTab
                    t={t}
                    bookType={bookType}
                    templates={form.templates}
                    templatesError={form.templatesError}
                    selectedTemplateId={form.selectedTemplateId}
                    onSelect={form.setSelectedTemplateId}
                    onDelete={form.handleDeleteTemplate}
                />

                <Tabs.Content value="blank">
                    {/* Blank mode has no extra content above the shared fields */}
                </Tabs.Content>
            </Tabs.Root>

            <div className={styles.body}>
                {/* === Stage 1: Required fields only === */}
                <div className="field">
                    <label className="label">{t("ui.create_book.book_title", "Titel")} *</label>
                    <input
                        className="input"
                        value={form.title}
                        onChange={(e) => form.setTitle(e.target.value)}
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
                        value={form.author}
                        onChange={form.setAuthor}
                        suggestions={form.authorSuggestions}
                        profileChoices={form.authorSuggestions}
                        customOptionLabel={t(
                            "ui.author_select.custom_option",
                            "Anderer Name …",
                        )}
                        showAddToAuthorsCheckbox={form.showAddToAuthorsCheckbox}
                        addToAuthorsDb={form.addToAuthorsDb}
                        onAddToAuthorsDbChange={form.setAddToAuthorsDb}
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
                <OptionalDetailsSection
                    t={t}
                    detailsOpen={form.detailsOpen}
                    onDetailsOpenChange={form.setDetailsOpen}
                    genre={form.genre}
                    onGenreChange={form.setGenre}
                    subtitle={form.subtitle}
                    onSubtitleChange={form.setSubtitle}
                    description={form.description}
                    onDescriptionChange={form.setDescription}
                    language={form.language}
                    customLanguages={form.customLanguages}
                    onLanguageChange={(v) => {
                        form.setLanguageTouched(true);
                        form.setLanguage(v);
                    }}
                    onCustomLanguageAdd={(v) =>
                        form.setCustomLanguages((prev) =>
                            prev.some((c) => c.toLowerCase() === v.toLowerCase())
                                ? prev
                                : [...prev, v],
                        )
                    }
                    isSeries={form.isSeries}
                    onSeriesToggle={(checked) => {
                        form.setIsSeries(checked);
                        if (!checked) {
                            form.setSeries("");
                            form.setSeriesIndex("");
                        }
                    }}
                    series={form.series}
                    onSeriesChange={form.setSeries}
                    seriesIndex={form.seriesIndex}
                    onSeriesIndexChange={form.setSeriesIndex}
                />
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
                <button className="btn btn-ghost" onClick={onCancel}>
                    {t("ui.common.cancel", "Abbrechen")}
                </button>
                <button
                    className="btn btn-primary"
                    onClick={form.handleSubmit}
                    disabled={!form.canSubmit}
                    data-testid="create-book-submit"
                >
                    {t("ui.common.create", "Erstellen")}
                </button>
            </div>
        </div>
    );
}
