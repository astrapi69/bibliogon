import {createContext, useCallback, useContext, useMemo, useState} from "react";
import type {ReactNode} from "react";

/**
 * Global state for the help panel.
 *
 * Any component can call ``openHelp("export/epub")`` to open the help
 * panel on a specific page. The panel itself is mounted at the App root
 * and consumes this context.
 */
interface HelpContextValue {
    open: boolean;
    slug: string | null;
    openHelp: (slug?: string) => void;
    closeHelp: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({children}: {children: ReactNode}) {
    const [open, setOpen] = useState(false);
    const [slug, setSlug] = useState<string | null>(null);

    const openHelp = useCallback((s?: string) => {
        setSlug(s || null);
        setOpen(true);
    }, []);

    const closeHelp = useCallback(() => {
        setOpen(false);
    }, []);

    const value = useMemo(
        () => ({open, slug, openHelp, closeHelp}),
        [open, slug, openHelp, closeHelp],
    );

    return (
        <HelpContext.Provider value={value}>
            {children}
        </HelpContext.Provider>
    );
}

export function useHelp(): HelpContextValue {
    const ctx = useContext(HelpContext);
    if (!ctx) throw new Error("useHelp must be used inside HelpProvider");
    return ctx;
}
