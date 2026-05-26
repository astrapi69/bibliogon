/**
 * Vitest coverage for VerhaltenSettings
 * (SETT-PHASE-2-ALLGEMEIN-TAB-SPLIT-01).
 *
 * Pins the extracted "Verhalten" tab — Language + Trash +
 * delete-permanently + allow-without-author lifted out of the old
 * catch-all "Allgemein" tab.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {VerhaltenSettings} from "./VerhaltenSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "de",
        setLang: vi.fn(),
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

    it("invokes onSave with the {app: {...}} envelope on save click", () => {
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
        });
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
