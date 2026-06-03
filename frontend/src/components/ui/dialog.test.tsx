import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "./dialog";

/*
 * Wiring/structure assertions (happy-dom renders no CSS). Visual
 * like-for-like fidelity vs the old `.dialog-*` classes is verified in a
 * browser, not here (Coverage Illusion rule).
 */
describe("Dialog primitive (Phase B C1, like-for-like)", () => {
    it("renders open content with title + description (a11y description first-class)", () => {
        render(
            <Dialog open>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>My title</DialogTitle>
                    </DialogHeader>
                    <DialogDescription>My message</DialogDescription>
                    <DialogFooter>
                        <button>OK</button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>,
        );
        expect(screen.getByText("My title")).toBeInTheDocument();
        expect(screen.getByText("My message")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "OK"})).toBeInTheDocument();
    });

    it("applies the size-variant width class", () => {
        render(
            <Dialog open>
                <DialogContent size="large" data-testid="dc">
                    <DialogTitle>t</DialogTitle>
                </DialogContent>
            </Dialog>,
        );
        const content = screen.getByTestId("dc");
        expect(content.className).toContain("w-[min(720px,95vw)]");
        // base geometry present too
        expect(content.className).toContain("rounded-[var(--radius-lg)]");
    });
});
