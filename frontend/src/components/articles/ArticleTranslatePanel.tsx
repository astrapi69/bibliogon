import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Languages, Loader2 } from "lucide-react";

import { api, ApiError, Article } from "../../api/client";
import { useI18n } from "../../hooks/useI18n";
import { useFeature } from "@astrapi69/feature-strategy-react";
import { FEATURES } from "../../features/featureConfig";
import { RadixSelect } from "../shared/RadixSelect";
import { notify } from "../../utils/platform/notify";
import layout from "../../pages/ArticleEditor.module.css";

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
    // Translation execution (DeepL / LMStudio) runs through the backend
    // translation plugin; offline (Dexie) it resolves disabled so the section
    // stays visible + explained instead of firing /api on the guardedFetch
    // backstop (#34). No provider/health fetch is attempted when disabled.
    const translation = useFeature(FEATURES.TRANSLATION);
    const offline = !translation.isActive;

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
            const result = await api.articleTranslation.translate(article.id, translateLang, {
                sourceLang: article.language,
                provider: translateProvider,
            });
            notify.success(t("ui.articles.translate_success", "Übersetzung erstellt."));
            setTranslateOpen(false);
            navigate(`/articles/${result.article_id}`);
        } catch (err) {
            if (err instanceof ApiError) {
                // Surface the backend detail (e.g. "No DeepL API key
                // configured...") via notify's ApiError content - the
                // generic title alone wasn't actionable.
                notify.error(t("ui.articles.translate_failed", "Übersetzung fehlgeschlagen."), err);
            }
        } finally {
            setTranslating(false);
        }
    };

    if (offline) {
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
                    title={t(
                        "ui.feature.requires_desktop_app",
                        "Diese Funktion benötigt die Desktop-App.",
                    )}
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
                    {t(
                        "ui.feature.requires_desktop_app",
                        "Diese Funktion benötigt die Desktop-App.",
                    )}
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
                                !providerAvailable ||
                                providers === null ||
                                noProvidersAvailable
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
