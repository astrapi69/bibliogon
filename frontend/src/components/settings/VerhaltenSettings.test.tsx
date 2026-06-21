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
vi.mock("../../hooks/book/useBookTypes", () => ({
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

    it("auto-saves the {app + behavior + ui} envelope after a change (no save button)", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
            expect(screen.queryByTestId("verhalten-settings-save")).toBeNull();
            fireEvent.change(screen.getByTestId("settings-language-trigger"), {
                target: {value: "de"},
            });
            expect(onSave).not.toHaveBeenCalled();
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave).toHaveBeenCalledWith({
                app: {
                    default_language: "de",
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
                updates: {
                    auto_check: true,
                    check_interval: "daily",
                },
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("auto-saves the updates block: toggling auto-check + interval (#477)", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(
                <VerhaltenSettings
                    config={{
                        ...baseConfig,
                        updates: {
                            auto_check: true,
                            check_interval: "daily",
                            last_check_at: "2026-06-20T10:00:00Z",
                            dismissed_version: "v0.50.0",
                        },
                    }}
                    onSave={onSave}
                    saving={false}
                />,
            );
            // The section renders + the interval dropdown is visible while
            // auto-check is on.
            expect(screen.getByTestId("settings-updates-section")).toBeTruthy();
            fireEvent.change(screen.getByTestId("settings-check-interval-trigger"), {
                target: {value: "weekly"},
            });
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledTimes(1);
            const payload = onSave.mock.calls[0][0];
            expect(payload.updates).toEqual({
                auto_check: true,
                check_interval: "weekly",
                // runtime state preserved via the spread:
                last_check_at: "2026-06-20T10:00:00Z",
                dismissed_version: "v0.50.0",
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("rehydrates + threads the export-engine preference through the save payload", () => {
        vi.useFakeTimers();
        try {
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
            // ...and the value lands in the saved behavior block after an edit.
            fireEvent.change(screen.getByTestId("settings-language-trigger"), {
                target: {value: "de"},
            });
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    behavior: expect.objectContaining({export_engine: "client"}),
                }),
            );
        } finally {
            vi.useRealTimers();
        }
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
        vi.useFakeTimers();
        try {
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
            fireEvent.change(screen.getByTestId("settings-language-trigger"), {
                target: {value: "de"},
            });
            vi.advanceTimersByTime(500);
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
        } finally {
            vi.useRealTimers();
        }
    });

    it("preserves unrelated ui.* branches in the save payload", () => {
        vi.useFakeTimers();
        try {
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
            fireEvent.change(screen.getByTestId("settings-language-trigger"), {
                target: {value: "de"},
            });
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    ui: expect.objectContaining({
                        picture_book: {pdf_default_format: "8x10"},
                    }),
                }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("skip-non-destructive toggle auto-saves through the payload", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
            fireEvent.click(screen.getByTestId("settings-skip-non-destructive-confirmations"));
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    behavior: expect.objectContaining({
                        skip_non_destructive_confirmations: true,
                    }),
                }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("a checkbox toggle auto-saves immediately (debounced)", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(<VerhaltenSettings config={baseConfig} onSave={onSave} saving={false}/>);
            fireEvent.click(screen.getByTestId("settings-delete-permanently"));
            expect(onSave).not.toHaveBeenCalled();
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    app: expect.objectContaining({delete_permanently: true}),
                }),
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
