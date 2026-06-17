import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpdateBanner } from "./UpdateBanner";

describe("UpdateBanner", () => {
  it("renders the message and button label", () => {
    render(
      <UpdateBanner
        message="A new version is available."
        buttonLabel="Update now"
        onUpdate={() => {}}
      />,
    );
    expect(screen.getByTestId("update-banner")).toBeTruthy();
    expect(screen.getByText("A new version is available.")).toBeTruthy();
    expect(screen.getByTestId("update-banner-button").textContent).toBe("Update now");
  });

  it("fires onUpdate when the primary button is clicked", () => {
    const onUpdate = vi.fn();
    render(
      <UpdateBanner message="msg" buttonLabel="Update" onUpdate={onUpdate} />,
    );
    fireEvent.click(screen.getByTestId("update-banner-button"));
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("renders no dismiss control when onDismiss is omitted", () => {
    render(<UpdateBanner message="msg" buttonLabel="Update" onUpdate={() => {}} />);
    expect(screen.queryByTestId("update-banner-dismiss")).toBeNull();
  });

  it("fires onDismiss when the dismiss control is clicked", () => {
    const onDismiss = vi.fn();
    render(
      <UpdateBanner
        message="msg"
        buttonLabel="Update"
        onUpdate={() => {}}
        onDismiss={onDismiss}
        dismissLabel="Close"
      />,
    );
    const dismiss = screen.getByTestId("update-banner-dismiss");
    expect(dismiss.getAttribute("aria-label")).toBe("Close");
    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
