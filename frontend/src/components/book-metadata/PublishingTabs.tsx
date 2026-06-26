import { Sparkles } from "lucide-react";
import type { BookDetail } from "../../api/client";
import KeywordInput from "../book/KeywordInput";
import CategoryInput from "../book/CategoryInput";
import BisacCodeInput from "../book/BisacCodeInput";
import { Row, Field } from "./MetadataFields";
import { HtmlFieldWithPreview } from "./HtmlField";
import type { BookMetadataAiState, BookMetadataState, TFunc } from "./tabTypes";
import styles from "../BookMetadataEditor.module.css";

interface PublishingTabsProps {
    activeTab: string;
    book: BookDetail;
    meta: BookMetadataState;
    ai: BookMetadataAiState;
    t: TFunc;
}

/**
 * The "Veröffentlichung" sections of the book metadata editor: the
 * Publisher, ISBN, and Marketing tabs. Renders the tab matching
 * ``activeTab`` (or ``null`` otherwise).
 *
 * Extracted from BookMetadataEditor.tsx (god-file split, #207) as a pure
 * structural move — same JSX, same testids.
 *
 * @example
 * <PublishingTabs activeTab={effectiveTab} book={book} meta={meta} ai={ai} t={t} />
 */
export default function PublishingTabs({ activeTab, book, meta, ai, t }: PublishingTabsProps) {
    const {
        form,
        set,
        keywords,
        setKeywords,
        categories,
        setCategories,
        bisacCodes,
        setBisacCodes,
        kdpCategoriesCatalog,
    } = meta;
    const { aiGenerating, aiAvailable, handleAiGenerate } = ai;

    if (activeTab === "publisher") {
        return (
            <div className={styles.tabContent}>
                <Row>
                    <Field
                        label={t("ui.metadata.publisher", "Verlag")}
                        value={form.publisher}
                        onChange={(v) => set("publisher", v)}
                        placeholder="z.B. Conscious Path Publishing"
                    />
                    <Field
                        label={t("ui.metadata.publisher_city", "Stadt")}
                        value={form.publisher_city}
                        onChange={(v) => set("publisher_city", v)}
                        placeholder="z.B. Ludwigsburg"
                    />
                </Row>
            </div>
        );
    }

    if (activeTab === "isbn") {
        return (
            <div className={styles.tabContent}>
                <Row>
                    <Field
                        label="ISBN E-Book"
                        value={form.isbn_ebook}
                        onChange={(v) => set("isbn_ebook", v)}
                        placeholder="z.B. 9798253911952"
                    />
                    <Field
                        label="ISBN Taschenbuch"
                        value={form.isbn_paperback}
                        onChange={(v) => set("isbn_paperback", v)}
                    />
                </Row>
                <Row>
                    <Field
                        label="ISBN Hardcover"
                        value={form.isbn_hardcover}
                        onChange={(v) => set("isbn_hardcover", v)}
                    />
                    <Field
                        label="ASIN E-Book"
                        value={form.asin_ebook}
                        onChange={(v) => set("asin_ebook", v)}
                        placeholder="z.B. B0GV3XBGVB"
                    />
                </Row>
                <Row>
                    <Field
                        label="ASIN Taschenbuch"
                        value={form.asin_paperback}
                        onChange={(v) => set("asin_paperback", v)}
                    />
                    <Field
                        label="ASIN Hardcover"
                        value={form.asin_hardcover}
                        onChange={(v) => set("asin_hardcover", v)}
                    />
                </Row>
            </div>
        );
    }

    {
        /* Categories + BISAC (Bug 9) live in this Marketing section. With
            the NavigationSidebar refactor only the active section is
            rendered (conditional mount), so their testids are queryable
            only after the Marketing item is selected. */
    }
    if (activeTab === "marketing") {
        return (
            <div className={styles.tabContent}>
                {book.ai_tokens_used > 0 && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 12px",
                            marginBottom: 12,
                            background: "var(--surface-2)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                        }}
                    >
                        <Sparkles size={14} />
                        <span>
                            {t("ui.metadata.ai_usage", "AI-Nutzung")}:{" "}
                            {book.ai_tokens_used.toLocaleString()} Tokens{" "}
                            <span
                                title={t(
                                    "ui.metadata.ai_cost_hint",
                                    "Geschaetzte Kosten basierend auf typischen Anbieterpreisen",
                                )}
                            >
                                (~${(book.ai_tokens_used * 0.000003).toFixed(4)}
                                {" - "}${(book.ai_tokens_used * 0.000015).toFixed(4)})
                            </span>
                        </span>
                    </div>
                )}
                <div className="field">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 4,
                        }}
                    >
                        <label className="label" style={{ marginBottom: 0 }}>
                            {t("ui.metadata.keywords", "Schlüsselwoerter")}
                        </label>
                        {aiAvailable && (
                            <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={aiGenerating === "keywords"}
                                onClick={() => handleAiGenerate("keywords")}
                                title={t(
                                    "ui.metadata.ai_generate_keywords",
                                    "Keywords mit AI generieren",
                                )}
                                style={{
                                    fontSize: "0.75rem",
                                    padding: "2px 8px",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4,
                                }}
                            >
                                <Sparkles size={12} />
                                {aiGenerating === "keywords"
                                    ? t("ui.common.loading", "Laden...")
                                    : t("ui.metadata.ai_generate", "AI")}
                            </button>
                        )}
                    </div>
                    <KeywordInput keywords={keywords} onChange={setKeywords} />
                </div>
                {/* Bug 9: Books-only subject categorisation. Free-text
                    categories + format-validated BISAC codes. Articles
                    deliberately do NOT get these fields — see lessons-learned
                    "Intentional asymmetry" entry for the design rationale. */}
                <div className="field" data-testid="metadata-categories-field">
                    <label className="label">{t("ui.metadata.categories", "Kategorien")}</label>
                    <small
                        style={{
                            display: "block",
                            color: "var(--text-muted, #6b7280)",
                            marginBottom: 4,
                            fontSize: "0.75rem",
                        }}
                    >
                        {t(
                            "ui.metadata.categories_hint",
                            "KDP-Stil-Kategorienamen. Frei wählbar; jede Plattform hat ihre eigene Taxonomie.",
                        )}
                    </small>
                    <CategoryInput
                        categories={categories}
                        onChange={setCategories}
                        suggestions={kdpCategoriesCatalog}
                    />
                </div>
                <div className="field" data-testid="metadata-bisac-field">
                    <label className="label">{t("ui.metadata.bisac_codes", "BISAC-Codes")}</label>
                    <small
                        style={{
                            display: "block",
                            color: "var(--text-muted, #6b7280)",
                            marginBottom: 4,
                            fontSize: "0.75rem",
                        }}
                    >
                        {t(
                            "ui.metadata.bisac_hint",
                            "Branchen-Standard-Subject-Codes (KDP empfiehlt ≤ 3 Codes).",
                        )}
                    </small>
                    <BisacCodeInput codes={bisacCodes} onChange={setBisacCodes} />
                </div>
                <HtmlFieldWithPreview
                    label={t("ui.metadata.html_description", "Buch-Beschreibung (HTML für Amazon)")}
                    value={form.html_description}
                    onChange={(v) => set("html_description", v)}
                    maxChars={4000}
                    aiButton={
                        aiAvailable
                            ? {
                                  loading: aiGenerating === "html_description",
                                  onClick: () => handleAiGenerate("html_description"),
                                  label:
                                      aiGenerating === "html_description"
                                          ? t("ui.common.loading", "Laden...")
                                          : t("ui.metadata.ai_generate", "AI"),
                              }
                            : undefined
                    }
                />
                <HtmlFieldWithPreview
                    label={t("ui.metadata.backpage_description", "Rückseitenbeschreibung")}
                    value={form.backpage_description}
                    onChange={(v) => set("backpage_description", v)}
                    maxChars={600}
                    rows={4}
                    aiButton={
                        aiAvailable
                            ? {
                                  loading: aiGenerating === "backpage_description",
                                  onClick: () => handleAiGenerate("backpage_description"),
                                  label:
                                      aiGenerating === "backpage_description"
                                          ? t("ui.common.loading", "Laden...")
                                          : t("ui.metadata.ai_generate", "AI"),
                              }
                            : undefined
                    }
                />
                <HtmlFieldWithPreview
                    label={t("ui.metadata.author_bio", "Autoren-Kurzbiographie (Rückseite)")}
                    value={form.backpage_author_bio}
                    onChange={(v) => set("backpage_author_bio", v)}
                    maxChars={2000}
                    aiButton={
                        aiAvailable
                            ? {
                                  loading: aiGenerating === "backpage_author_bio",
                                  onClick: () => handleAiGenerate("backpage_author_bio"),
                                  label:
                                      aiGenerating === "backpage_author_bio"
                                          ? t("ui.common.loading", "Laden...")
                                          : t("ui.metadata.ai_generate", "AI"),
                              }
                            : undefined
                    }
                />
            </div>
        );
    }

    return null;
}
