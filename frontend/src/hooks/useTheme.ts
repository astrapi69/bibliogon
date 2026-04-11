import {useEffect, useState} from "react";

import {DEFAULT_PALETTE, isKnownPalette} from "../themes/palettes";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
    const stored = localStorage.getItem("bibliogon-theme");
    if (stored === "dark" || stored === "light") return stored;
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
}

function getInitialAppTheme(): string {
    // Guard against a stale localStorage value left over from a removed
    // or renamed palette. Unknown values fall back to the default so
    // the CSS always matches a real rule block.
    const stored = localStorage.getItem("bibliogon-app-theme");
    if (stored && isKnownPalette(stored)) return stored;
    return DEFAULT_PALETTE;
}

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);
    const [appTheme, setAppTheme] = useState<string>(getInitialAppTheme);

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("bibliogon-theme", theme);
    }, [theme]);

    useEffect(() => {
        document.documentElement.setAttribute("data-app-theme", appTheme);
        localStorage.setItem("bibliogon-app-theme", appTheme);
    }, [appTheme]);

    const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

    return {theme, toggle, appTheme, setAppTheme};
}
