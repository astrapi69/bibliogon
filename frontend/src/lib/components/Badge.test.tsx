import {describe, it, expect} from "vitest";
import {render, screen} from "@testing-library/react";
import {Badge} from "./Badge";

describe("Badge", () => {
    it("renders children with the default variant classes", () => {
        render(<Badge testId="b">Draft</Badge>);
        const el = screen.getByTestId("b");
        expect(el).toHaveClass("badge");
        expect(el).toHaveClass("badge-default");
        expect(el).toHaveTextContent("Draft");
    });

    it("applies the chosen variant + size", () => {
        render(
            <Badge testId="b" variant="success" size="sm">
                Published
            </Badge>,
        );
        const el = screen.getByTestId("b");
        expect(el).toHaveClass("badge-success");
        expect(el).toHaveClass("badge-sm");
    });

    it("renders an optional icon + title and extra className", () => {
        render(
            <Badge
                testId="b"
                variant="danger"
                title="tip"
                className="extra"
                icon={<svg data-testid="ico" />}
            >
                Archived
            </Badge>,
        );
        const el = screen.getByTestId("b");
        expect(el).toHaveClass("badge-danger");
        expect(el).toHaveClass("extra");
        expect(el).toHaveAttribute("title", "tip");
        expect(screen.getByTestId("ico")).toBeInTheDocument();
    });
});
