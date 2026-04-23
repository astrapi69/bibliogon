import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OverrideFields } from "./OverrideFields";

vi.mock("../../../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_: string, fallback: string) => fallback,
        lang: "en",
        setLang: vi.fn(),
    }),
}));

describe("OverrideFields", () => {
    it("title input starts as the detected title when no override set", () => {
        render(
            <OverrideFields
                overrides={{}}
                detectedTitle="My Book"
                detectedAuthor="Alice"
                detectedLanguage="en"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByTestId("override-title")).toHaveValue("My Book");
    });

    it("editing the title emits override with the new value", () => {
        const onChange = vi.fn();
        render(
            <OverrideFields
                overrides={{}}
                detectedTitle="Old"
                detectedAuthor="Alice"
                detectedLanguage="en"
                onChange={onChange}
            />,
        );
        fireEvent.change(screen.getByTestId("override-title"), {
            target: { value: "New" },
        });
        expect(onChange).toHaveBeenCalledWith({ title: "New" });
    });

    it("clearing a field drops the key from overrides", () => {
        const onChange = vi.fn();
        render(
            <OverrideFields
                overrides={{ title: "Temp" }}
                detectedTitle="Detected"
                detectedAuthor={null}
                detectedLanguage={null}
                onChange={onChange}
            />,
        );
        fireEvent.change(screen.getByTestId("override-title"), {
            target: { value: "" },
        });
        expect(onChange).toHaveBeenCalledWith({});
    });

    it("language dropdown selects the active override", () => {
        const onChange = vi.fn();
        render(
            <OverrideFields
                overrides={{}}
                detectedTitle="X"
                detectedAuthor="Y"
                detectedLanguage="en"
                onChange={onChange}
            />,
        );
        fireEvent.change(screen.getByTestId("override-language"), {
            target: { value: "de" },
        });
        expect(onChange).toHaveBeenCalledWith({ language: "de" });
    });

    it("subtitle input emits override only when non-empty", () => {
        const onChange = vi.fn();
        render(
            <OverrideFields
                overrides={{}}
                detectedTitle="X"
                detectedAuthor="Y"
                detectedLanguage="en"
                onChange={onChange}
            />,
        );
        fireEvent.change(screen.getByTestId("override-subtitle"), {
            target: { value: "a subtitle" },
        });
        expect(onChange).toHaveBeenCalledWith({ subtitle: "a subtitle" });
    });
});
