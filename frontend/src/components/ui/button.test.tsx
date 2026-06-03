import {describe, it, expect, vi} from "vitest";
import {render, screen, fireEvent} from "@testing-library/react";

import {Button} from "./button";

/*
 * These assert WIRING (class application, cn() merge, prop forwarding,
 * the @ alias resolving), NOT visual rendering -- happy-dom does not
 * apply global.css/Tailwind CSS or compute layout. Visual correctness
 * of the token mapping is proven separately by ``npm run build`` (the
 * compiled CSS must emit ``var(--accent)`` etc.) and, when needed, a
 * browser smoke. See lessons-learned "Coverage Illusion".
 */
describe("Button (Tailwind + shadcn co-existence proof)", () => {
    it("renders children and defaults to type=button", () => {
        render(<Button>Click me</Button>);
        const btn = screen.getByRole("button", {name: "Click me"});
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveAttribute("type", "button");
    });

    it("applies token-mapped variant + size utility classes", () => {
        render(
            <Button variant="destructive" size="lg">
                Delete
            </Button>,
        );
        const btn = screen.getByRole("button", {name: "Delete"});
        // bg-destructive -> var(--danger); proves the semantic class wired.
        expect(btn.className).toContain("bg-destructive");
        expect(btn.className).toContain("text-destructive-foreground");
        expect(btn.className).toContain("h-11");
    });

    it("merges a custom className via cn() without dropping base classes", () => {
        render(<Button className="w-full">Wide</Button>);
        const btn = screen.getByRole("button", {name: "Wide"});
        expect(btn.className).toContain("w-full");
        expect(btn.className).toContain("inline-flex");
        // default variant still present
        expect(btn.className).toContain("bg-primary");
    });

    it("forwards native button props (disabled, onClick)", () => {
        const onClick = vi.fn();
        render(
            <Button disabled onClick={onClick}>
                Nope
            </Button>,
        );
        const btn = screen.getByRole("button", {name: "Nope"});
        expect(btn).toBeDisabled();
        fireEvent.click(btn);
        expect(onClick).not.toHaveBeenCalled();
    });
});
