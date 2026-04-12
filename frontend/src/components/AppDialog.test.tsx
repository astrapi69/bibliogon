/**
 * Tests for AppDialog (DialogProvider + useDialog hook).
 *
 * Covers: confirm/prompt/alert variants, resolve values,
 * cancel behavior, prompt input handling, testid selectors,
 * error when used outside provider.
 */

import React from "react"
import {describe, it, expect, vi} from "vitest"
import {render, screen, fireEvent, waitFor, act} from "@testing-library/react"

import {DialogProvider, useDialog} from "./AppDialog"

// Mock useI18n to avoid needing the full provider chain
vi.mock("../hooks/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, fallback: string) => fallback,
    lang: "en",
    setLang: vi.fn(),
  }),
}))

/** Helper that renders a button to trigger a dialog and shows the result. */
function TestHarness({
  dialogFn,
}: {
  dialogFn: (dialog: ReturnType<typeof useDialog>) => Promise<unknown>
}) {
  const dialog = useDialog()
  const [result, setResult] = React.useState<string>("pending")

  const trigger = async () => {
    const value = await dialogFn(dialog)
    setResult(JSON.stringify(value))
  }

  return (
    <>
      <button data-testid="trigger" onClick={trigger}>
        Trigger
      </button>
      <div data-testid="result">{result}</div>
    </>
  )
}

function renderWithDialog(
  dialogFn: (dialog: ReturnType<typeof useDialog>) => Promise<unknown>,
) {
  return render(
    <DialogProvider>
      <TestHarness dialogFn={dialogFn} />
    </DialogProvider>,
  )
}

describe("AppDialog", () => {
  describe("confirm dialog", () => {
    it("resolves true when confirm button is clicked", async () => {
      renderWithDialog((d) => d.confirm("Delete?", "Are you sure?"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Delete?")

      fireEvent.click(screen.getByTestId("app-dialog-confirm"))

      await waitFor(() => {
        expect(screen.getByTestId("result").textContent).toBe("true")
      })
    })

    it("resolves false when cancel button is clicked", async () => {
      renderWithDialog((d) => d.confirm("Delete?", "Are you sure?"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Delete?")

      fireEvent.click(screen.getByTestId("app-dialog-cancel"))

      await waitFor(() => {
        expect(screen.getByTestId("result").textContent).toBe("false")
      })
    })

    it("shows title and message", async () => {
      renderWithDialog((d) => d.confirm("My Title", "My message text"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("My Title")
      expect(screen.getByText("My message text")).toBeTruthy()
    })
  })

  describe("prompt dialog", () => {
    it("resolves with trimmed input when confirmed", async () => {
      renderWithDialog((d) => d.prompt("Rename", "Enter name", "Name..."))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Rename")

      const input = screen.getByPlaceholderText("Name...")
      fireEvent.change(input, {target: {value: "  New Name  "}})
      fireEvent.click(screen.getByTestId("app-dialog-confirm"))

      await waitFor(() => {
        expect(screen.getByTestId("result").textContent).toBe('"New Name"')
      })
    })

    it("resolves null when cancelled", async () => {
      renderWithDialog((d) => d.prompt("Rename", "Enter name"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Rename")

      fireEvent.click(screen.getByTestId("app-dialog-cancel"))

      await waitFor(() => {
        expect(screen.getByTestId("result").textContent).toBe("null")
      })
    })

    it("confirm button is disabled when input is empty", async () => {
      renderWithDialog((d) => d.prompt("Rename", "Enter name"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Rename")

      const confirmBtn = screen.getByTestId("app-dialog-confirm")
      expect(confirmBtn).toBeDisabled()
    })

    it("resolves null when input is whitespace only", async () => {
      renderWithDialog((d) => d.prompt("Rename", "Enter name"))

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Rename")

      const input = screen.getByRole("textbox")
      fireEvent.change(input, {target: {value: "   "}})
      // Confirm should still be disabled for whitespace-only
      expect(screen.getByTestId("app-dialog-confirm")).toBeDisabled()
    })

    it("pre-fills default value", async () => {
      renderWithDialog((d) =>
        d.prompt("Rename", "Enter name", "Name...", "Default Value"),
      )

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Rename")

      const input = screen.getByRole("textbox") as HTMLInputElement
      expect(input.value).toBe("Default Value")
    })
  })

  describe("alert dialog", () => {
    it("resolves when OK is clicked (no cancel button)", async () => {
      renderWithDialog(async (d) => {
        await d.alert("Notice", "Something happened")
        return "done"
      })

      fireEvent.click(screen.getByTestId("trigger"))
      await screen.findByText("Notice")

      // Alert should not have a cancel button
      expect(screen.queryByTestId("app-dialog-cancel")).toBeNull()

      fireEvent.click(screen.getByTestId("app-dialog-confirm"))

      await waitFor(() => {
        expect(screen.getByTestId("result").textContent).toBe('"done"')
      })
    })
  })

  describe("useDialog outside provider", () => {
    it("throws when used without DialogProvider", () => {
      function Broken() {
        useDialog()
        return null
      }

      expect(() => render(<Broken />)).toThrow(
        "useDialog must be used within DialogProvider",
      )
    })
  })
})
