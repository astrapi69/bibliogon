/**
 * TopicsSettings tests pin the article-topics list surface and the
 * auto-save-on-mutation contract (#57): adding or removing a topic must
 * persist immediately via ``onSave`` so a navigation away before the
 * explicit Save click cannot lose the change.
 */

import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";
import {TopicsSettings} from "./TopicsSettings";

vi.mock("../../hooks/useI18n", () => ({
    useI18n: () => ({t: (_k: string, fallback: string) => fallback}),
}));

describe("TopicsSettings", () => {
    it("renders the root, add input, and save button", () => {
        render(<TopicsSettings config={{}} onSave={() => {}} saving={false} />);
        expect(screen.getByTestId("topics-settings")).toBeTruthy();
        expect(screen.getByTestId("topic-add-input")).toBeTruthy();
        expect(screen.getByTestId("topics-save-btn")).toBeTruthy();
    });

    it("seeds topics from config.topics", () => {
        render(
            <TopicsSettings config={{topics: ["Tech", "Travel"]}} onSave={() => {}} saving={false} />,
        );
        expect(screen.getByTestId("topic-row-0").textContent).toContain("Tech");
        expect(screen.getByTestId("topic-row-1").textContent).toContain("Travel");
    });

    it("auto-saves immediately when a topic is added (no Speichern click)", () => {
        const onSave = vi.fn();
        render(<TopicsSettings config={{topics: []}} onSave={onSave} saving={false} />);
        const input = screen.getByTestId("topic-add-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Science"}});
        fireEvent.click(screen.getByTestId("topic-add-btn"));
        expect(onSave).toHaveBeenCalledWith({topics: ["Science"]});
        expect(input.value).toBe("");
        expect(screen.getByTestId("topic-row-0").textContent).toContain("Science");
    });

    it("auto-saves when a topic is added via Enter", () => {
        const onSave = vi.fn();
        render(<TopicsSettings config={{topics: ["Tech"]}} onSave={onSave} saving={false} />);
        const input = screen.getByTestId("topic-add-input") as HTMLInputElement;
        fireEvent.change(input, {target: {value: "Music"}});
        fireEvent.keyDown(input, {key: "Enter"});
        expect(onSave).toHaveBeenCalledWith({topics: ["Tech", "Music"]});
    });

    it("auto-saves immediately when a topic is removed", () => {
        const onSave = vi.fn();
        render(
            <TopicsSettings config={{topics: ["Keep", "Drop"]}} onSave={onSave} saving={false} />,
        );
        fireEvent.click(screen.getByTestId("topic-remove-1"));
        expect(onSave).toHaveBeenCalledWith({topics: ["Keep"]});
        expect(screen.queryByTestId("topic-row-1")).toBeNull();
    });

    it("does not add or save a duplicate topic", () => {
        const onSave = vi.fn();
        render(<TopicsSettings config={{topics: ["Solo"]}} onSave={onSave} saving={false} />);
        fireEvent.change(screen.getByTestId("topic-add-input"), {target: {value: "Solo"}});
        fireEvent.click(screen.getByTestId("topic-add-btn"));
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.queryByTestId("topic-row-1")).toBeNull();
    });

    it("the Save button still persists the current list (manual fallback)", () => {
        const onSave = vi.fn();
        render(<TopicsSettings config={{topics: ["A"]}} onSave={onSave} saving={false} />);
        fireEvent.click(screen.getByTestId("topics-save-btn"));
        expect(onSave).toHaveBeenCalledWith({topics: ["A"]});
    });

    it("disables the add button on empty input", () => {
        render(<TopicsSettings config={{}} onSave={() => {}} saving={false} />);
        expect((screen.getByTestId("topic-add-btn") as HTMLButtonElement).disabled).toBe(true);
    });

    it("shows an empty-state hint when there are no topics", () => {
        render(<TopicsSettings config={{topics: []}} onSave={() => {}} saving={false} />);
        expect(screen.getByTestId("topics-empty")).toBeTruthy();
    });

    it("hides the empty-state once a topic exists", () => {
        render(<TopicsSettings config={{topics: ["Tech"]}} onSave={() => {}} saving={false} />);
        expect(screen.queryByTestId("topics-empty")).toBeNull();
    });
});
