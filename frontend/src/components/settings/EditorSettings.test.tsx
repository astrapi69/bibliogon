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

    it("invokes onSave with the {editor: {...}} envelope on save click", () => {
        const onSave = vi.fn();
        render(<EditorSettings config={baseConfig} onSave={onSave} saving={false}/>);
        fireEvent.change(screen.getByTestId("editor-autosave"), {target: {value: "1500"}});
        fireEvent.click(screen.getByTestId("editor-settings-save"));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledWith({
            editor: {
                autosave_debounce_ms: 1500,
                draft_save_debounce_ms: 3000,
                draft_max_age_days: 45,
                ai_context_chars: 4000,
            },
        });
    });
});
