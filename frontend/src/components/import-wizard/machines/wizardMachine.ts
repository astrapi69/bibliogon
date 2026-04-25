/**
 * Import-wizard state machine (XState v5).
 *
 * Replaces the prior ad-hoc useState/useEffect transitions in
 * ``ImportWizardModal``. Forward-compatible target for other
 * complex Bibliogon flows (conflict resolution, plugin
 * activation, audiobook pipeline).
 *
 * State graph (top-level):
 *   upload → detecting → summary → preview (single | multi) →
 *   executing → success | error
 *
 * The machine OWNS state transitions + context. Async side
 * effects (network calls to detect / execute) live in a single
 * ``useEffect`` in ``ImportWizardModal`` that subscribes to
 * ``state.value`` and dispatches the resulting events back into
 * the machine.
 *
 * Companion docs: ``docs/architecture/state-machines.md``.
 */

import { setup, assign } from "xstate";
import type {
    DetectedProject,
    DuplicateInfo,
    GitAdoption,
    Overrides,
} from "../../../api/import";
import type { WizardError } from "../errorContext";

export type WizardInput =
    | { kind: "file"; files: File[]; paths?: string[] }
    | { kind: "git-url"; url: string };

export type DuplicateAction = "create" | "overwrite";

export interface MultiBookSelection {
    /** Per-book source_identifier the user wants imported. Empty
     * disables the Import button. */
    selectedSourceIds: string[];
    /** Per-book duplicate decision. Default "skip" for any book
     * the user has not explicitly decided. */
    perBookDuplicateAction: Record<
        string,
        "skip" | "overwrite" | "create_new"
    >;
}

export interface WizardContext {
    input: WizardInput | null;
    detected: DetectedProject | null;
    duplicate: DuplicateInfo | null;
    tempRef: string | null;

    /** Single-book per-field overrides; multi-book branch ignores
     * this and sends ``selected_books`` instead. */
    overrides: Overrides;
    duplicateAction: DuplicateAction;
    gitAdoption: GitAdoption;
    multiBookSelection: MultiBookSelection;

    bookId: string | null;
    importedBookIds: string[];
    title: string;

    error: WizardError | null;
}

export type WizardEvent =
    | { type: "SELECT_FILE"; files: File[]; paths?: string[] }
    | { type: "SELECT_GIT_URL"; url: string }
    | {
          type: "DETECTION_COMPLETE";
          detected: DetectedProject;
          duplicate: DuplicateInfo;
          tempRef: string;
      }
    | { type: "DETECTION_FAILED"; error: WizardError }
    | { type: "ADVANCE_FROM_SUMMARY" }
    | { type: "OVERRIDES_CHANGE"; overrides: Overrides }
    | { type: "DUPLICATE_ACTION_CHANGE"; action: DuplicateAction }
    | { type: "GIT_ADOPTION_CHANGE"; choice: GitAdoption }
    | { type: "TOGGLE_BOOK_SELECTION"; sourceId: string }
    | { type: "SELECT_ALL_BOOKS" }
    | { type: "DESELECT_ALL_BOOKS" }
    | {
          type: "SET_PER_BOOK_DUPLICATE_ACTION";
          sourceId: string;
          action: "skip" | "overwrite" | "create_new";
      }
    | { type: "EXECUTE" }
    | {
          type: "EXECUTE_SUCCESS";
          bookId: string;
          bookIds: string[];
          title: string;
      }
    | { type: "EXECUTE_FAILED"; error: WizardError }
    | { type: "RETRY" }
    | { type: "CANCEL" }
    | { type: "RESET" };

const initialContext: WizardContext = {
    input: null,
    detected: null,
    duplicate: null,
    tempRef: null,
    overrides: {},
    duplicateAction: "create",
    gitAdoption: "start_fresh",
    multiBookSelection: {
        selectedSourceIds: [],
        perBookDuplicateAction: {},
    },
    bookId: null,
    importedBookIds: [],
    title: "",
    error: null,
};

export const wizardMachine = setup({
    types: {} as {
        context: WizardContext;
        events: WizardEvent;
    },
    guards: {
        isMultiBook: ({ context }) =>
            context.detected?.is_multi_book === true,
        hasMultiBookSelection: ({ context }) =>
            context.multiBookSelection.selectedSourceIds.length > 0,
        canRetry: ({ context }) =>
            context.error?.retryable === true,
    },
    actions: {
        setInput: assign(({ event }) => {
            if (event.type === "SELECT_FILE") {
                return {
                    input: {
                        kind: "file" as const,
                        files: event.files,
                        paths: event.paths,
                    },
                    error: null,
                };
            }
            if (event.type === "SELECT_GIT_URL") {
                return {
                    input: { kind: "git-url" as const, url: event.url },
                    error: null,
                };
            }
            return {};
        }),
        setDetected: assign(({ event }) => {
            if (event.type !== "DETECTION_COMPLETE") return {};
            const sourceIds = event.detected.is_multi_book
                ? (event.detected.books ?? []).map(
                      (b) => b.source_identifier,
                  )
                : [];
            return {
                detected: event.detected,
                duplicate: event.duplicate,
                tempRef: event.tempRef,
                multiBookSelection: {
                    selectedSourceIds: sourceIds,
                    perBookDuplicateAction: {},
                },
            };
        }),
        setOverrides: assign(({ event }) =>
            event.type === "OVERRIDES_CHANGE"
                ? { overrides: event.overrides }
                : {},
        ),
        setDuplicateAction: assign(({ event }) =>
            event.type === "DUPLICATE_ACTION_CHANGE"
                ? { duplicateAction: event.action }
                : {},
        ),
        setGitAdoption: assign(({ event }) =>
            event.type === "GIT_ADOPTION_CHANGE"
                ? { gitAdoption: event.choice }
                : {},
        ),
        toggleBookSelection: assign(({ context, event }) => {
            if (event.type !== "TOGGLE_BOOK_SELECTION") return {};
            const current = context.multiBookSelection.selectedSourceIds;
            const next = current.includes(event.sourceId)
                ? current.filter((id) => id !== event.sourceId)
                : [...current, event.sourceId];
            return {
                multiBookSelection: {
                    ...context.multiBookSelection,
                    selectedSourceIds: next,
                },
            };
        }),
        selectAllBooks: assign(({ context }) => ({
            multiBookSelection: {
                ...context.multiBookSelection,
                selectedSourceIds: (context.detected?.books ?? []).map(
                    (b) => b.source_identifier,
                ),
            },
        })),
        deselectAllBooks: assign(({ context }) => ({
            multiBookSelection: {
                ...context.multiBookSelection,
                selectedSourceIds: [],
            },
        })),
        setPerBookDuplicateAction: assign(({ context, event }) => {
            if (event.type !== "SET_PER_BOOK_DUPLICATE_ACTION") return {};
            return {
                multiBookSelection: {
                    ...context.multiBookSelection,
                    perBookDuplicateAction: {
                        ...context.multiBookSelection.perBookDuplicateAction,
                        [event.sourceId]: event.action,
                    },
                },
            };
        }),
        setExecuteSuccess: assign(({ event }) => {
            if (event.type !== "EXECUTE_SUCCESS") return {};
            return {
                bookId: event.bookId,
                importedBookIds: event.bookIds,
                title: event.title,
            };
        }),
        setError: assign(({ event }) => {
            if (
                event.type !== "DETECTION_FAILED" &&
                event.type !== "EXECUTE_FAILED"
            ) {
                return {};
            }
            return { error: event.error };
        }),
        clearError: assign({ error: null }),
        reset: assign(() => initialContext),
    },
}).createMachine({
    id: "importWizard",
    initial: "upload",
    context: initialContext,
    states: {
        upload: {
            on: {
                SELECT_FILE: { target: "detecting", actions: "setInput" },
                SELECT_GIT_URL: {
                    target: "detecting",
                    actions: "setInput",
                },
            },
        },
        detecting: {
            on: {
                DETECTION_COMPLETE: {
                    target: "summary",
                    actions: "setDetected",
                },
                DETECTION_FAILED: {
                    target: "error",
                    actions: "setError",
                },
                CANCEL: { target: "upload", actions: "reset" },
            },
        },
        summary: {
            on: {
                ADVANCE_FROM_SUMMARY: [
                    {
                        target: "previewMultiBook",
                        guard: "isMultiBook",
                    },
                    { target: "previewSingleBook" },
                ],
                CANCEL: { target: "upload", actions: "reset" },
            },
        },
        previewSingleBook: {
            on: {
                OVERRIDES_CHANGE: { actions: "setOverrides" },
                DUPLICATE_ACTION_CHANGE: { actions: "setDuplicateAction" },
                GIT_ADOPTION_CHANGE: { actions: "setGitAdoption" },
                EXECUTE: "executing",
                CANCEL: { target: "upload", actions: "reset" },
            },
        },
        previewMultiBook: {
            on: {
                TOGGLE_BOOK_SELECTION: { actions: "toggleBookSelection" },
                SELECT_ALL_BOOKS: { actions: "selectAllBooks" },
                DESELECT_ALL_BOOKS: { actions: "deselectAllBooks" },
                SET_PER_BOOK_DUPLICATE_ACTION: {
                    actions: "setPerBookDuplicateAction",
                },
                EXECUTE: {
                    target: "executing",
                    guard: "hasMultiBookSelection",
                },
                CANCEL: { target: "upload", actions: "reset" },
            },
        },
        executing: {
            on: {
                EXECUTE_SUCCESS: {
                    target: "success",
                    actions: "setExecuteSuccess",
                },
                EXECUTE_FAILED: {
                    target: "error",
                    actions: "setError",
                },
            },
        },
        success: {
            on: {
                RESET: { target: "upload", actions: "reset" },
            },
        },
        error: {
            on: {
                RETRY: [
                    {
                        target: "detecting",
                        guard: "canRetry",
                        actions: "clearError",
                    },
                    { target: "upload", actions: "reset" },
                ],
                CANCEL: { target: "upload", actions: "reset" },
                RESET: { target: "upload", actions: "reset" },
            },
        },
    },
});
