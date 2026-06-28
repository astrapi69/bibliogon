/**
 * Step dispatcher for the Article-to-Book conversion wizard (#207
 * god-file split). Renders the current step body from the
 * `useConvertToBookWizard` return. The two large form steps (selection,
 * metadata) live in WizardStepsBig.tsx; the four lighter steps
 * (front-matter / back-matter / chapter-settings / review) live here.
 * data-testids are unchanged.
 */

import { styles } from "./styles";
import { useConvertToBookWizard } from "./useConvertToBookWizard";
import { StepSelection, StepMetadata } from "./WizardStepsBig";

type Wizard = ReturnType<typeof useConvertToBookWizard>;

export function WizardSteps({ wizard }: { wizard: Wizard }) {
    switch (wizard.step) {
        case 0:
            return <StepSelection wizard={wizard} />;
        case 1:
            return <StepMetadata wizard={wizard} />;
        case 2:
            return <StepFrontMatter wizard={wizard} />;
        case 3:
            return <StepBackMatter wizard={wizard} />;
        case 4:
            return <StepChapterSettings wizard={wizard} />;
        case 5:
            return <StepReview wizard={wizard} />;
        default:
            return null;
    }
}

function StepFrontMatter({ wizard }: { wizard: Wizard }) {
    const {
        t,
        includeTitlePage,
        setIncludeTitlePage,
        includeDedication,
        setIncludeDedication,
        dedicationText,
        setDedicationText,
        includeIntroduction,
        setIncludeIntroduction,
        introductionText,
        setIntroductionText,
    } = wizard;
    return (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.front_matter_hint",
                    "Optionale Vorspann-Kapitel — überspringbar.",
                )}
            </p>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeTitlePage}
                    onChange={(e) => setIncludeTitlePage(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-title-page-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.front_matter_title_page",
                        "Titelseite (leer; im Buch-Editor anpassen)",
                    )}
                </span>
            </label>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeDedication}
                    onChange={(e) => setIncludeDedication(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-dedication-toggle"
                />
                <span>{t("ui.convert_to_book.front_matter_dedication", "Widmung")}</span>
            </label>
            {includeDedication && (
                <textarea
                    className="input"
                    rows={3}
                    value={dedicationText}
                    onChange={(e) => setDedicationText(e.target.value)}
                    placeholder={t(
                        "ui.convert_to_book.front_matter_dedication_placeholder",
                        "Für …",
                    )}
                    data-testid="convert-to-book-wizard-front-matter-dedication-text"
                />
            )}
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeIntroduction}
                    onChange={(e) => setIncludeIntroduction(e.target.checked)}
                    data-testid="convert-to-book-wizard-front-matter-introduction-toggle"
                />
                <span>
                    {t("ui.convert_to_book.front_matter_introduction", "Einleitung")}
                </span>
            </label>
            {includeIntroduction && (
                <textarea
                    className="input"
                    rows={4}
                    value={introductionText}
                    onChange={(e) => setIntroductionText(e.target.value)}
                    data-testid="convert-to-book-wizard-front-matter-introduction-text"
                />
            )}
        </div>
    );
}

function StepBackMatter({ wizard }: { wizard: Wizard }) {
    const {
        t,
        includeAcknowledgments,
        setIncludeAcknowledgments,
        acknowledgmentsText,
        setAcknowledgmentsText,
        includeAuthorBio,
        setIncludeAuthorBio,
        authorBioText,
        setAuthorBioText,
    } = wizard;
    return (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.back_matter_hint",
                    "Optionale Nachspann-Kapitel — überspringbar.",
                )}
            </p>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeAcknowledgments}
                    onChange={(e) => setIncludeAcknowledgments(e.target.checked)}
                    data-testid="convert-to-book-wizard-back-matter-acknowledgments-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.back_matter_acknowledgments",
                        "Danksagung",
                    )}
                </span>
            </label>
            {includeAcknowledgments && (
                <textarea
                    className="input"
                    rows={3}
                    value={acknowledgmentsText}
                    onChange={(e) => setAcknowledgmentsText(e.target.value)}
                    data-testid="convert-to-book-wizard-back-matter-acknowledgments-text"
                />
            )}
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={includeAuthorBio}
                    onChange={(e) => setIncludeAuthorBio(e.target.checked)}
                    data-testid="convert-to-book-wizard-back-matter-author-bio-toggle"
                />
                <span>
                    {t(
                        "ui.convert_to_book.back_matter_author_bio",
                        "Über den Autor",
                    )}
                </span>
            </label>
            {includeAuthorBio && (
                <textarea
                    className="input"
                    rows={3}
                    value={authorBioText}
                    onChange={(e) => setAuthorBioText(e.target.value)}
                    data-testid="convert-to-book-wizard-back-matter-author-bio-text"
                />
            )}
        </div>
    );
}

function StepChapterSettings({ wizard }: { wizard: Wizard }) {
    const { t, useArticleTitleAsChapterTitle, setUseArticleTitleAsChapterTitle } = wizard;
    return (
        <div style={styles.stepContent}>
            <label style={styles.toggleRow}>
                <input
                    type="checkbox"
                    checked={useArticleTitleAsChapterTitle}
                    onChange={(e) =>
                        setUseArticleTitleAsChapterTitle(e.target.checked)
                    }
                    data-testid="convert-to-book-wizard-chapter-settings-use-article-title"
                />
                <span>
                    {t(
                        "ui.convert_to_book.chapter_settings_use_article_title",
                        "Artikel-Titel als Kapitel-Titel verwenden",
                    )}
                </span>
            </label>
            <small style={styles.fieldHint}>
                {t(
                    "ui.convert_to_book.chapter_settings_use_article_title_hint",
                    "Wenn deaktiviert, werden Kapitel als 'Chapter 1', 'Chapter 2' usw. benannt.",
                )}
            </small>
        </div>
    );
}

function StepReview({ wizard }: { wizard: Wizard }) {
    const {
        t,
        title,
        author,
        selectedIds,
        sortStrategy,
        includeTitlePage,
        includeDedication,
        includeIntroduction,
        includeAcknowledgments,
        includeAuthorBio,
    } = wizard;
    const frontMatterCount =
        (includeTitlePage ? 1 : 0) +
        (includeDedication ? 1 : 0) +
        (includeIntroduction ? 1 : 0);
    const backMatterCount =
        (includeAcknowledgments ? 1 : 0) + (includeAuthorBio ? 1 : 0);
    const total = frontMatterCount + selectedIds.size + backMatterCount;
    return (
        <div style={styles.stepContent}>
            <p style={styles.hint}>
                {t(
                    "ui.convert_to_book.review_hint",
                    "Bitte prüfen. Originale Artikel bleiben unverändert im Artikel-Dashboard.",
                )}
            </p>
            <dl style={styles.reviewList}>
                <dt>{t("ui.convert_to_book.review_title", "Titel")}</dt>
                <dd data-testid="convert-to-book-wizard-review-title-value">
                    {title || (
                        <em style={{color: "var(--danger)"}}>
                            {t(
                                "ui.convert_to_book.review_title_missing",
                                "(noch nicht gesetzt)",
                            )}
                        </em>
                    )}
                </dd>
                <dt>{t("ui.convert_to_book.review_author", "Autor")}</dt>
                <dd>{author || "—"}</dd>
                <dt>
                    {t(
                        "ui.convert_to_book.review_chapter_total",
                        "Kapitel insgesamt",
                    )}
                </dt>
                <dd data-testid="convert-to-book-wizard-review-chapter-count">
                    {total}{" "}
                    <small style={{color: "var(--text-muted)"}}>
                        ({frontMatterCount} +{" "}
                        {selectedIds.size} +{" "}
                        {backMatterCount})
                    </small>
                </dd>
                <dt>
                    {t("ui.convert_to_book.review_sort", "Sortierung")}
                </dt>
                <dd>{sortStrategy}</dd>
            </dl>
        </div>
    );
}
