import {useEffect, useState} from "react";
import {api} from "../api/client";

type I18nStrings = Record<string, unknown>;

let cachedLang = "";
let cachedStrings: I18nStrings = {};

/**
 * Hook to load and access i18n strings from the backend.
 * Caches strings per language. Falls back to key if string not found.
 */
export function useI18n() {
    const [strings, setStrings] = useState<I18nStrings>(cachedStrings);
    const [lang, setLang] = useState(cachedLang || "de");

    useEffect(() => {
        // Load language preference from app settings
        api.settings.getApp().then((config) => {
            const appLang = ((config.app as Record<string, unknown>)?.default_language as string) || "de";
            setLang(appLang);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        if (lang === cachedLang && Object.keys(cachedStrings).length > 0) {
            setStrings(cachedStrings);
            return;
        }
        api.getStarted.guide(lang); // trigger load (side effect)
        fetch(`/api/i18n/${lang}`)
            .then((r) => r.json())
            .then((data) => {
                cachedLang = lang;
                cachedStrings = data;
                setStrings(data);
            })
            .catch(() => {});
    }, [lang]);

    /**
     * Get a translated string by dot-notation key.
     * Example: t("ui.common.save") -> "Speichern"
     * Returns key as fallback if not found.
     */
    const t = (key: string, fallback?: string): string => {
        const parts = key.split(".");
        let current: unknown = strings;
        for (const part of parts) {
            if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
                current = (current as Record<string, unknown>)[part];
            } else {
                return fallback || key;
            }
        }
        return typeof current === "string" ? current : (fallback || key);
    };

    return {t, lang};
}
