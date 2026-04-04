import {createContext, useContext, useEffect, useState, useCallback, type ReactNode} from "react";
import {api} from "../api/client";
import React from "react";

type I18nStrings = Record<string, unknown>;

interface I18nContextValue {
    t: (key: string, fallback?: string) => string;
    lang: string;
    setLang: (lang: string) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

// Module-level cache to avoid refetching on remount
let cachedLang = "";
let cachedStrings: I18nStrings = {};

export function I18nProvider({children}: {children: ReactNode}) {
    const [strings, setStrings] = useState<I18nStrings>(cachedStrings);
    const [lang, setLangState] = useState(cachedLang || "de");

    // Load language preference from app settings on mount
    useEffect(() => {
        if (cachedLang) return; // already loaded
        api.settings.getApp().then((config) => {
            const appLang = ((config.app as Record<string, unknown>)?.default_language as string) || "de";
            setLangState(appLang);
        }).catch(() => {});
    }, []);

    // Fetch strings when language changes
    useEffect(() => {
        if (lang === cachedLang && Object.keys(cachedStrings).length > 0) {
            setStrings(cachedStrings);
            return;
        }
        fetch(`/api/i18n/${lang}`)
            .then((r) => r.json())
            .then((data) => {
                cachedLang = lang;
                cachedStrings = data;
                setStrings(data);
            })
            .catch(() => {});
    }, [lang]);

    const setLang = useCallback((newLang: string) => {
        setLangState(newLang);
    }, []);

    const t = useCallback((key: string, fallback?: string): string => {
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
    }, [strings]);

    const value: I18nContextValue = {t, lang, setLang};

    return React.createElement(I18nContext.Provider, {value}, children);
}

/**
 * Hook to access i18n translations.
 * Returns {t, lang, setLang} - setLang triggers live language switch.
 */
export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        // Fallback for components rendered outside provider (e.g. tests)
        return {
            t: (key: string, fallback?: string) => fallback || key,
            lang: "de",
            setLang: () => {},
        };
    }
    return ctx;
}
