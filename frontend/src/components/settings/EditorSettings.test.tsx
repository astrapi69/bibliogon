/**
 * Vitest coverage for EditorSettings (SETT-PHASE-1-QUICK-WINS-01).
 *
 * Pins SETT-QW-3: the 4 editor numeric inputs render inside the
 * dedicated EditorSettings card (extracted from AppSettings as a
 * separate tab), seed from ``config.editor.*`` with sensible
 * fallbacks, and the save button invokes ``onSave`` with the
 * ``{editor: {...}}`` envelope.
 *
 * Behaviour-test (per ``.claude/rules/lessons-learned.md``
 * "End-to-end behaviour tests are not 'kwarg passes through'
 * tests"): assertions on the OBSERVABLE save payload, not just on
 * "did the prop fire."
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {EditorSettings} from "./EditorSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
    }),
}));

describe("EditorSettings — extracted Editor tab (SETT-QW-3)", () => {
    const baseConfig = {
        editor: {
            autosave_debounce_ms: 1200,
            draft_save_debounce_ms: 3000,
            draft_max_age_days: 45,
            ai_context_chars: 4000,
        },
    };

    it("renders the section heading + 4 numeric inputs", () => {
        render(<EditorSettings config={baseConfig} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("editor-settings")).toBeInTheDocument();
        expect(screen.getByText("Editor")).toBeInTheDocument();
        expect(screen.getByTestId("editor-autosave")).toHaveValue(1200);
        expect(screen.getByTestId("editor-draft-save")).toHaveValue(3000);
        expect(screen.getByTestId("editor-draft-age")).toHaveValue(45);
        expect(screen.getByTestId("editor-ai-chars")).toHaveValue(4000);
    });

    it("falls back to defaults when config.editor is missing", () => {
        render(<EditorSettings config={{}} onSave={vi.fn()} saving={false}/>);
        expect(screen.getByTestId("editor-autosave")).toHaveValue(800);
        expect(screen.getByTestId("editor-draft-save")).toHaveValue(2000);
        expect(screen.getByTestId("editor-draft-age")).toHaveValue(30);
        expect(screen.getByTestId("editor-ai-chars")).toHaveValue(2000);
    });

    it("auto-saves the {editor + ui.picture_book + kdp} envelope after an input change (no save button)", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(<EditorSettings config={baseConfig} onSave={onSave} saving={false}/>);
            expect(screen.queryByTestId("editor-settings-save")).toBeNull();
            fireEvent.change(screen.getByTestId("editor-autosave"), {target: {value: "1500"}});
            expect(onSave).not.toHaveBeenCalled();
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledTimes(1);
            expect(onSave).toHaveBeenCalledWith({
                editor: {
                    autosave_debounce_ms: 1500,
                    draft_save_debounce_ms: 3000,
                    draft_max_age_days: 45,
                    ai_context_chars: 4000,
                },
                ui: {
                    picture_book: {
                        pdf_default_format: "8.5x8.5",
                        pdf_default_bleed_marks: false,
                    },
                },
                kdp: {
                    default_marketplace: "US",
                },
            });
        } finally {
            vi.useRealTimers();
        }
    });

    it("coalesces several rapid input changes into a single save", () => {
        vi.useFakeTimers();
        try {
            const onSave = vi.fn();
            render(<EditorSettings config={baseConfig} onSave={onSave} saving={false}/>);
            fireEvent.change(screen.getByTestId("editor-autosave"), {target: {value: "1500"}});
            fireEvent.change(screen.getByTestId("editor-draft-save"), {target: {value: "3500"}});
            fireEvent.change(screen.getByTestId("editor-ai-chars"), {target: {value: "5000"}});
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("seeds PDF defaults from config.ui.picture_book when present", () => {
        vi.useFakeTimers();
        try {
            const cfg = {
                ...baseConfig,
                ui: {
                    picture_book: {
                        pdf_default_format: "8.5x11",
                        pdf_default_bleed_marks: true,
                    },
                },
            };
            const onSave = vi.fn();
            render(<EditorSettings config={cfg} onSave={onSave} saving={false}/>);
            fireEvent.change(screen.getByTestId("editor-autosave"), {target: {value: "1500"}});
            vi.advanceTimersByTime(500);
            expect(onSave).toHaveBeenCalledWith(
                expect.objectContaining({
                    ui: expect.objectContaining({
                        picture_book: {
                            pdf_default_format: "8.5x11",
                            pdf_default_bleed_marks: true,
                        },
                    }),
                }),
            );
        } finally {
            vi.useRealTimers();
        }
    });
});
