import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Languages, Loader2 } from "lucide-react";

import { api, ApiError, Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURE_REASON, FEATURES } from "../../features/featureConfig";
import { RadixSelect } from "../shared/RadixSelect";
import { notify } from "../../utils/platform/notify";
import { getStorage } from "../../storage";
import { translateArticleWithAi } from "../../utils/translation/translateArticleWithAi";
import layout from "../../pages/ArticleEditor.module.css";

/** German fallbacks per reason key, for the case where the catalog has no
 *  entry. One message for every reason this gate can produce, so the text
 *  cannot contradict the key it was chosen for. */
const REASON_FALLBACKS: Record<string, string> = {
    [FEATURE_REASON.REQUIRES_AI_KEY]:
        "Dafür wird ein API-Schlüssel in den KI-Einstellungen benötigt.",
    [FEATURE_REASON.REQUIRES_NETWORK]: "Dafür wird eine Internetverbindung benötigt.",
    [FEATURE_REASON.REQUIRES_DESKTOP_APP]: "Diese Funktion benötigt die Desktop-App.",
    default: "Diese Funktion benötigt die Desktop-App.",
};

/** Languages Bibliogon UI ships in. Mirrors backend/config/i18n/. */
const SUPPORTED_LANGUAGES: { code: string; label: string }[] = [
    { code: "de", label: "Deutsch" },
    { code: "en", label: "English" },
    { code: "es", label: "Español" },
    { code: "fr", label: "Français" },
    { code: "pt", label: "Português" },
    { code: "el", label: "Ελληνικά" },
    { code: "tr", label: "Türkçe" },
    { code: "ja", label: "日本語" },
];

type ProviderInfo = {
    id: string;
    name: string;
    configured: boolean;
    healthy: boolean;
    description: string;
};

/** AR editor-parity Phase 2: translate the article into a new
 *  target-language Article. The source stays untouched; the new
 *  article opens in draft for review. Fully self-contained — owns its
 *  own open / provider / target-language state + the provider-health
 *  fetch. */
export default function ArticleTranslatePanel({ article }: { article: Article }) {
    const { t } = useI18n();
    const navigate = useNavigate();
    // DeepL and LMStudio run through the backend plugin and have no browser
    // path - DeepL's is the verify-first question still open on #750/#751,
    // LMStudio is a localhost server a PWA cannot reach. Offline the article
    // is translated through the user's own AI provider instead (#751), so
    // the gate is a key plus a live connection rather than "requires the
    // desktop app", and the section explains whichever actually applies.
    const translation = useFeature(FEATURES.TRANSLATION);
    const unavailable = !translation.isActive;
    const usesAiProvider = getStorage().mode === "dexie";
    // No provider/health fetch offline: there is no provider endpoint to
    // ask, and the dropdown it feeds is hidden.
    const offline = unavailable || usesAiProvider;

    const [translateOpen, setTranslateOpen] = useState(false);
    const [translateLang, setTranslateLang] = useState("en");
    const [translateProvider, setTranslateProvider] = useState<"deepl" | "lmstudio">("deepl");
    const [translating, setTranslating] = useState(false);
    const [providers, setProviders] = useState<ProviderInfo[] | null>(null);

    // Fetch provider config + live health when the user opens the
    // panel. Combines /providers (config check, fast) with /health
    // (live ping; LMStudio ping has 5s timeout per the client).
    // Filtering by both means the dropdown only lists providers
    // that will actually translate - no 400s, no 120s timeouts.
    useEffect(() => {
        if (offline || !translateOpen || providers !== null) return;
        let cancelled = false;
        Promise.all([api.articleTranslation.providers(), api.articleTranslation.health()])
            .then(([list, health]) => {
                if (cancelled) return;
                const enriched: ProviderInfo[] = list.map((p) => ({
                    ...p,
                    healthy: health[p.id]?.status === "ok",
                }));
                setProviders(enriched);
                // Default to the first available (configured AND
                // healthy) provider.
                const firstAvailable = enriched.find((p) => p.configured && p.healthy);
                if (
                    firstAvailable &&
                    (firstAvailable.id === "deepl" || firstAvailable.id === "lmstudio")
                ) {
                    setTranslateProvider(firstAvailable.id);
                }
            })
            .catch(() => setProviders([]));
        return () => {
            cancelled = true;
        };
    }, [offline, translateOpen, providers]);

    const currentProvider = providers?.find((p) => p.id === translateProvider);
    const providerAvailable = currentProvider
        ? currentProvider.configured && currentProvider.healthy
        : true;
    const noProvidersAvailable =
        providers !== null && providers.every((p) => !p.configured || !p.healthy);

    /** The offline path: the user's own AI provider, one call per piece.
     *  A piece that fails keeps its source value, so the result is an
     *  article with one untranslated field rather than no article - said
     *  out loud instead of passed off as a clean translation. */
    const translateWithProvider = async (): Promise<string> => {
        const result = await translateArticleWithAi(article, {
            targetLang: translateLang,
        });
        if (result.untranslatedPieces > 0) {
            notify.warning(
                t(
                    "ui.articles.translate_partial",
                    "{count} Teil(e) konnten nicht übersetzt werden und blieben im Original.",
                ).replace("{count}", String(result.untranslatedPieces)),
            );
        }
        return result.articleId;
    };

    const handleTranslate = async () => {
        if (!article || translating) return;
        if (translateLang === article.language) {
            notify.error(
                t(
                    "ui.articles.translate_same_language",
                    "Zielsprache muss von der Quellsprache abweichen.",
                ),
            );
            return;
        }
        setTranslating(true);
        try {
            const articleId = usesAiProvider
                ? await translateWithProvider()
                : (
                      await api.articleTranslation.translate(article.id, translateLang, {
                          sourceLang: article.language,
                          provider: translateProvider,
                      })
                  ).article_id;
            notify.success(t("ui.articles.translate_success", "Übersetzung erstellt."));
            setTranslateOpen(false);
            navigate(`/articles/${articleId}`);
        } catch (err) {
            // Surface the backend detail (e.g. "No DeepL API key
            // configured...") via notify's ApiError content - the
            // generic title alone wasn't actionable.
            notify.error(t("ui.articles.translate_failed", "Übersetzung fehlgeschlagen."), err);
        } finally {
            setTranslating(false);
        }
    };

    if (unavailable) {
        // The reason key comes from the registry; the fallback has to match
        // it, or a missing catalog entry would tell a PWA user to install
        // the desktop app when what they need is an API key.
        const reasonKey = translation.reason ?? FEATURE_REASON.REQUIRES_DESKTOP_APP;
        const reason = t(reasonKey, REASON_FALLBACKS[reasonKey] ?? REASON_FALLBACKS.default);
        return (
            <>
                <h4 className={layout.sectionHeading}>
                    {t("ui.articles.translate_section", "Übersetzen")}
                </h4>
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled
                    data-testid="article-editor-translate-open"
                    title={reason}
                    style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    <Languages size={12} />
                    {t("ui.articles.translate_open", "Diesen Artikel übersetzen")}
                </button>
                <p
                    data-testid="article-editor-translate-offline"
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: 0 }}
                >
                    {reason}
                </p>
            </>
        );
    }

    return (
        <>
            <h4 className={layout.sectionHeading}>
                {t("ui.articles.translate_section", "Übersetzen")}
            </h4>
            {!translateOpen ? (
                <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setTranslateOpen(true)}
                    data-testid="article-editor-translate-open"
                    style={{
                        alignSelf: "flex-start",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                    }}
                >
                    <Languages size={12} />
                    {t("ui.articles.translate_open", "Diesen Artikel übersetzen")}
                </button>
            ) : (
                <div
                    data-testid="article-editor-translate-panel"
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                    <p
                        style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            margin: 0,
                        }}
                    >
                        {t(
                            "ui.articles.translate_hint",
                            "Erstellt einen neuen Artikel-Entwurf in der Zielsprache. Inline-Formatierung (fett/kursiv) geht beim Übersetzen verloren.",
                        )}
                    </p>
                    <label className={layout.fieldLabel}>
                        {t("ui.articles.translate_provider", "Anbieter")}
                    </label>
                    {(() => {
                        const visibleProviders = (providers ?? []).filter(
                            (p) => p.configured && p.healthy,
                        );
                        if (providers !== null && visibleProviders.length === 0) {
                            return (
                                <p
                                    data-testid="article-editor-translate-no-providers"
                                    style={{
                                        fontSize: "0.75rem",
                                        color: "var(--danger)",
                                        margin: 0,
                                    }}
                                >
                                    {t(
                                        "ui.articles.translate_no_providers",
                                        "Kein Übersetzungs-Anbieter konfiguriert. Einstellungen > Plugins > Translation öffnen, um DeepL oder LMStudio einzurichten.",
                                    )}
                                </p>
                            );
                        }
                        return (
                            <RadixSelect
                                testId="article-editor-translate-provider"
                                value={translateProvider}
                                onValueChange={(v) =>
                                    setTranslateProvider(v as "deepl" | "lmstudio")
                                }
                                disabled={translating || providers === null}
                                className="is-block"
                                ariaLabel={t("ui.articles.translate_provider", "Provider")}
                                options={visibleProviders.map((p) => ({
                                    value: p.id,
                                    label: p.name,
                                }))}
                            />
                        );
                    })()}
                    <label className={layout.fieldLabel}>
                        {t("ui.articles.translate_target_lang", "Zielsprache")}
                    </label>
                    <RadixSelect
                        testId="article-editor-translate-lang"
                        value={translateLang}
                        onValueChange={setTranslateLang}
                        disabled={translating}
                        className="is-block"
                        ariaLabel={t("ui.articles.translate_target", "Zielsprache")}
                        options={SUPPORTED_LANGUAGES.filter(
                            (l) => l.code !== article.language,
                        ).map((opt) => ({
                            value: opt.code,
                            label: opt.label,
                        }))}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                        <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => void handleTranslate()}
                            disabled={
                                translating ||
                                // The provider checks gate the BACKEND path
                                // only. Offline there is no provider list to
                                // wait for - the AI provider is whichever one
                                // Settings holds - so requiring a fetched
                                // list would leave the button permanently
                                // disabled with no way to find out why.
                                (!usesAiProvider &&
                                    (!providerAvailable ||
                                        providers === null ||
                                        noProvidersAvailable))
                            }
                            data-testid="article-editor-translate-submit"
                        >
                            {translating ? (
                                <>
                                    <Loader2 size={12} className="spin" />{" "}
                                    {t("ui.articles.translate_running", "Übersetzt…")}
                                </>
                            ) : (
                                t("ui.articles.translate_submit", "Übersetzen")
                            )}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setTranslateOpen(false)}
                            disabled={translating}
                            data-testid="article-editor-translate-cancel"
                        >
                            {t("ui.common.cancel", "Abbrechen")}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
