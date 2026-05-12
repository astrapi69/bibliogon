import {describe, it, expect, vi, beforeEach} from "vitest"
import {render, screen, fireEvent} from "@testing-library/react"
import FieldClassDialog from "./FieldClassDialog"

// UNIVERSAL-AI-TEMPLATE-02 Session 2, commit 2/10. Pins the
// FieldClassDialog contract: checkbox-driven submit, force
// toggle, inline_image_count override visible only for the
// article + image_prompts combination, submit produces the
// AiFillRequest the parent can hand straight to the API client.

vi.mock("../hooks/useI18n", () => ({
    useI18n: () => ({
        t: (_key: string, fallback: string) => fallback,
        lang: "en",
        setLang: () => {},
    }),
}))

describe("FieldClassDialog", () => {
    let onSubmit: ReturnType<typeof vi.fn> & ((req: unknown) => void)
    let onClose: ReturnType<typeof vi.fn> & (() => void)

    beforeEach(() => {
        onSubmit = vi.fn() as typeof onSubmit
        onClose = vi.fn() as typeof onClose
    })

    it("renders all five article field-classes", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        for (const id of ["seo", "tags", "topic", "excerpt", "image_prompts"]) {
            expect(screen.getByTestId(`field-class-${id}`)).toBeTruthy()
        }
    })

    it("renders all five book field-classes", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="book"
            />,
        )
        for (const id of [
            "marketing_copy",
            "tags",
            "description_genre",
            "cover_prompt",
            "chapter_summaries",
        ]) {
            expect(screen.getByTestId(`field-class-${id}`)).toBeTruthy()
        }
    })

    it("submit is disabled until at least one class is selected", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        const submit = screen.getByTestId("field-class-submit") as HTMLButtonElement
        expect(submit.disabled).toBe(true)

        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))
        expect(submit.disabled).toBe(false)
    })

    it("submit builds an AiFillRequest with selected classes + default force=false", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))
        fireEvent.click(screen.getByTestId("field-class-checkbox-tags"))
        fireEvent.click(screen.getByTestId("field-class-submit"))

        expect(onSubmit).toHaveBeenCalledTimes(1)
        const arg = onSubmit.mock.calls[0][0]
        expect(arg.field_classes.sort()).toEqual(["seo", "tags"])
        expect(arg.force).toBe(false)
        // inline_image_count is undefined when image_prompts is not selected.
        expect(arg.inline_image_count).toBeUndefined()
    })

    it("toggling force flips the flag in the submitted request", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))
        fireEvent.click(screen.getByTestId("field-class-force"))
        fireEvent.click(screen.getByTestId("field-class-submit"))
        expect(onSubmit.mock.calls[0][0].force).toBe(true)
    })

    it("checking a class twice toggles it off", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        const box = screen.getByTestId("field-class-checkbox-seo")
        fireEvent.click(box)
        fireEvent.click(box)
        const submit = screen.getByTestId("field-class-submit") as HTMLButtonElement
        expect(submit.disabled).toBe(true)
    })

    it("inline_image_count input is hidden until image_prompts is selected", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        expect(screen.queryByTestId("field-class-inline-count")).toBeNull()
        fireEvent.click(screen.getByTestId("field-class-checkbox-image_prompts"))
        expect(screen.getByTestId("field-class-inline-count")).toBeTruthy()
    })

    it("inline_image_count is omitted from the request when not overridden", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-image_prompts"))
        fireEvent.click(screen.getByTestId("field-class-submit"))
        expect(onSubmit.mock.calls[0][0].inline_image_count).toBeUndefined()
    })

    it("inline_image_count override flows into the request", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-image_prompts"))
        const input = screen.getByTestId("field-class-inline-count") as HTMLInputElement
        fireEvent.change(input, {target: {value: "4"}})
        fireEvent.click(screen.getByTestId("field-class-submit"))
        expect(onSubmit.mock.calls[0][0].inline_image_count).toBe(4)
    })

    it("inline_image_count clamps to [1, 10]", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-image_prompts"))
        const input = screen.getByTestId("field-class-inline-count") as HTMLInputElement
        fireEvent.change(input, {target: {value: "99"}})
        fireEvent.click(screen.getByTestId("field-class-submit"))
        expect(onSubmit.mock.calls[0][0].inline_image_count).toBe(10)
    })

    it("books never receive inline_image_count even with image_prompts in scope", () => {
        // Books don't have an image_prompts class at all; this is a
        // negative test pinning the cross-kind invariant.
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="book"
            />,
        )
        expect(screen.queryByTestId("field-class-image_prompts")).toBeNull()
        fireEvent.click(
            screen.getByTestId("field-class-checkbox-cover_prompt"),
        )
        fireEvent.click(screen.getByTestId("field-class-submit"))
        expect(onSubmit.mock.calls[0][0].inline_image_count).toBeUndefined()
    })

    it("cancel button calls onClose", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-cancel"))
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("loading=true disables both buttons", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
                loading
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))
        const cancel = screen.getByTestId("field-class-cancel") as HTMLButtonElement
        const submit = screen.getByTestId("field-class-submit") as HTMLButtonElement
        expect(cancel.disabled).toBe(true)
        expect(submit.disabled).toBe(true)
    })

    it("re-opening the dialog resets selection state", () => {
        const {rerender} = render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        fireEvent.click(screen.getByTestId("field-class-checkbox-seo"))

        rerender(
            <FieldClassDialog
                open={false}
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )
        rerender(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
            />,
        )

        const submit = screen.getByTestId("field-class-submit") as HTMLButtonElement
        expect(submit.disabled).toBe(true)  // selection was cleared on re-open
    })

    it("custom title + submit label override the defaults", () => {
        render(
            <FieldClassDialog
                open
                onClose={onClose}
                onSubmit={onSubmit}
                kind="article"
                title="Bulk fill"
                submitLabel="Start job"
            />,
        )
        expect(screen.getByText("Bulk fill")).toBeTruthy()
        expect(screen.getByText("Start job")).toBeTruthy()
    })
})
