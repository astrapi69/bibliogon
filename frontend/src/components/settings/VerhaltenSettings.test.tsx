/**
 * Vitest coverage for VerhaltenSettings
 * (SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01).
 *
 * Pins the extracted "Verhalten" tab — Language + Trash +
 * delete-permanently + allow-without-author lifted out of the old
 * catch-all "Allgemein" tab. CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01
 * added the "Standardwerte" section (default book-type + content-type)
 * to the same tab.
 */

import {describe, it, expect, vi} from "vitest";
import type {ReactElement} from "react";
import {render as rtlRender, screen, fireEvent} from "@testing-library/react";
import {VerhaltenSettings} from "./VerhaltenSettings";
import {FeatureTestProvider} from "../../features/FeatureTestProvider";

/**
 * VerhaltenSettings calls `useFeature` (for the pandoc-export engine gate),
 * so every render needs a FeatureProvider ancestor. Wrap through the real
 * registry; defaults to online (`api`) so the existing assertions are
 * unchanged, with an opt-in `mode` for the offline gate test.
 */
const render = (ui: ReactElement, opts?: {mode?: "api" | "dexie"}) =>
    rtlRender(<FeatureTestProvider mode={opts?.mode ?? "api"}>{ui}</FeatureTestProvider>);

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

// The Standardwerte section consumes the type registries via hooks.
// Mock them so the component renders without the App-root providers.
vi.mock("../../hooks/useBookTypes", () => ({
    useBookTypes: () => ({
        types: {},
        ordered: [
            {id: "prose", label_key: "ui.book_types.prose"},
            {id: "picture_book", label_key: "ui.book_types.picture_book"},
            {id: "comic_book", label_key: "ui.book_types.comic_book"},
        ],
        status: "ready",
        refresh: vi.fn(),
    }),
}));

vi.mock("../../hooks/useContentTypes", () => ({
    useContentTypes: () => ({
        types: {},
        ordered: [
            {id: "blogpost", label_key: "ui.content_types.blogpost"},
            {id: "tutorial", label_key: "ui.content_types.tutorial"},
            {id: "short_story", label_key: "ui.content_types.short_story"},
        ],
        defaultId: "blogpost",
        status: "ready",
        refresh: vi.fn(),
    }),
}));

describe("VerhaltenSettings — extracted Behavior tab", () => {
    const baseConfig = {
        app: {
            default_language: "en",
            trash_auto_delete_enabled: true,
            trash_auto_delete_days: 30,
            delete_permanently: false,
            allow_books_without_author: true,
        },
        ui: {
            defaults: {
                book_type: "prose",
                content_type: "blogpost",
            },
        },
    };

    it("renders the section heading + language select + all three checkboxes", () => {
        render(<VerhaltenSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("verhalten-settings")).toBeInTheDocument();
        expect(screen.getByText("Verhalten")).toBeInTheDocument();
        expect(screen.getByTestId("settings-language-trigger")).toBeInTheDocument();
        expect(screen.getByTestId("settings-trash-enabled")).toBeChecked();
        expect(screen.getByTestId("settings-delete-permanently")).not.toBeChecked();
        expect(screen.getByTestId("settings-allow-books-without-author")).toBeChecked();
    });

    it("renders the Standardwerte section with both type dropdowns", () => {
        render(<VerhaltenSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("settings-defaults")).toBeInTheDocument();
        expect(
            screen.getByTestId("settings-default-book-type-trigger"),
        ).toBeInTheDocument();
        expect(
            screen.getByTestId("settings-default-content-type-trigger"),
        ).toBeInTheDocument();
    });

    it("invokes onSave with the {app + behavior + ui} envelope on save click", () => {
        const onSave = vi.fn();
        render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            app: {
                default_language: "en",
                trash_auto_delete_enabled: true,
                trash_auto_delete_days: 30,
                delete_permanently: false,
                allow_books_without_author: true,
            },
            behavior: {
                skip_non_destructive_confirmations: false,
                export_engine: "auto",
            },
            ui: {
                custom_languages: [],
                defaults: {
                    book_type: "prose",
                    content_type: "blogpost",
                    book_language: "de",
                },
            },
        });
    });

    it("rehydrates + threads the export-engine preference through the save payload", () => {
        const onSave = vi.fn();
        render(
            <VerhaltenSettings
                config={{
                    ...baseConfig,
                    behavior: {export_engine: "client"},
                }}
                onSave={onSave}
                saving={false}
            />,
        );
        // The select shows the rehydrated value...
        expect(
            screen.getByTestId("settings-export-engine-trigger"),
        ).toHaveTextContent(/Browser/);
        // ...and the value lands in the saved behavior block.
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                behavior: expect.objectContaining({export_engine: "client"}),
            }),
        );
    });

    it("offers the Backend (Pandoc) engine option online", () => {
        const config = {...baseConfig, behavior: {export_engine: "backend"}};
        render(<VerhaltenSettings config={config} onSave={vi.fn()} saving={false}/>, {
            mode: "api",
        });
        // The select trigger reflects the matched option's label.
        expect(
            screen.getByTestId("settings-export-engine-trigger"),
        ).toHaveTextContent(/Pandoc/);
    });

    it("hides the Backend (Pandoc) engine option offline (pandoc-export gated)", () => {
        const config = {...baseConfig, behavior: {export_engine: "backend"}};
        render(<VerhaltenSettings config={config} onSave={vi.fn()} saving={false}/>, {
            mode: "dexie",
        });
        // Backend engine is filtered out in dexie mode, so the orphaned value
        // has no option to label the trigger with -> "Pandoc" is gone.
        expect(
            screen.getByTestId("settings-export-engine-trigger"),
        ).not.toHaveTextContent(/Pandoc/);
    });

    it("threads the default book-type + content-type through the save payload", () => {
        const onSave = vi.fn();
        render(
            <VerhaltenSettings
                config={{
                    ...baseConfig,
                    ui: {defaults: {book_type: "comic_book", content_type: "tutorial"}},
                }}
                onSave={onSave}
                saving={false}
            />,
        );
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                ui: {
                    custom_languages: [],
                    defaults: {
                        book_type: "comic_book",
                        content_type: "tutorial",
                        book_language: "de",
                    },
                },
            }),
        );
    });

    it("preserves unrelated ui.* branches in the save payload", () => {
        const onSave = vi.fn();
        render(
            <VerhaltenSettings
                config={{
                    ...baseConfig,
                    ui: {
                        picture_book: {pdf_default_format: "8x10"},
                        defaults: {book_type: "prose", content_type: "blogpost"},
                    },
                }}
                onSave={onSave}
                saving={false}
            />,
        );
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                ui: expect.objectContaining({
                    picture_book: {pdf_default_format: "8x10"},
                }),
            }),
        );
    });

    it("skip-non-destructive toggle threads through the save payload", () => {
        const onSave = vi.fn();
        render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("settings-skip-non-destructive-confirmations"));
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                behavior: expect.objectContaining({
                    skip_non_destructive_confirmations: true,
                }),
            }),
        );
    });

    it("reflects checkbox toggles in the save payload", () => {
        const onSave = vi.fn();
        render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.click(screen.getByTestId("settings-delete-permanently"));
        fireEvent.click(screen.getByTestId("verhalten-settings-save"));
        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({
                app: expect.objectContaining({delete_permanently: true}),
            }),
        );
    });
});
