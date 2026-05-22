/**
 * KDP Publishing Wizard — Phase 2 state machine (XState v5).
 *
 * Replaces the Phase 1 ``useState`` step-index in
 * ``KdpPublishingWizard.tsx``. C2 ships the 3-visible-step subset
 * (metadata + cover + export) matching Phase 1's user-visible
 * navigation. C8 extends with the ``pricing`` state; C10 extends
 * with the ``arc`` state. The ``PricingState`` / ``ArcReviewer``
 * type primitives in ``types.ts`` stay defined for that
 * forward-compat path.
 *
 * State graph (C2 — 7 states):
 *
 *   metadata ⇌ metadataError
 *      ↓ ADVANCE (canAdvanceFromMetadata)
 *   cover
 *      ↓ ADVANCE (canAdvanceFromCover)
 *   export ⇌ exporting → exportSuccess
 *                    └─→ exportError ⇌ exporting (RETRY)
 *
 *   anywhere: CANCEL → reset → metadata
 *   error sub-states: RETRY → previous async state (guarded)
 *
 * Per ``docs/architecture/state-machines.md``: actions are pure
 * context updates; async side effects live in the React layer's
 * ``useEffect`` that subscribes to ``state.value``. Transient
 * async state (in-flight promises, AbortControllers) MUST NOT
 * land in context.
 *
 * STATE_LOADED / STATE_SAVED events deferred to C11
 * (persistence wiring).
 */

import { setup, assign } from "xstate";

import {
    initialContext,
    type KdpWizardContext,
    type KdpWizardEvent,
} from "./types";

export const kdpWizardMachine = setup({
    types: {} as {
        context: KdpWizardContext;
        events: KdpWizardEvent;
    },
    guards: {
        // ``metadataResult !== null`` is the "loaded" sentinel:
        // before the step component's API call returns, the guard
        // blocks ADVANCE. After load, an empty issuesFiltered
        // array also passes (no errors).
        canAdvanceFromMetadata: ({ context }) =>
            context.metadataResult !== null &&
            !context.metadataIssuesFiltered.some(
                (i) => i.severity === "error",
            ),
        // ``coverDimensions !== null`` is the equivalent "validated"
        // sentinel for cover; populated by COVER_VALIDATED.
        canAdvanceFromCover: ({ context }) =>
            context.coverDimensions !== null &&
            !context.coverIssues.some((i) => i.severity === "error"),
        canRetry: ({ context }) => context.error?.retryable === true,
    },
    actions: {
        setMetadataResult: assign(({ event }) => {
            if (event.type !== "METADATA_LOADED") return {};
            return {
                metadataResult: event.result,
                metadataIssuesFiltered: event.issuesFiltered,
                error: null,
            };
        }),
        setCoverValidated: assign(({ event }) => {
            if (event.type !== "COVER_VALIDATED") return {};
            return {
                coverDimensions: event.dim,
                coverIssues: event.issues,
            };
        }),
        setExportResult: assign(({ event }) => {
            if (event.type !== "EXPORT_SUCCESS") return {};
            return {
                exportFilename: event.filename,
                exportBlobUrl: event.blobUrl,
                error: null,
            };
        }),
        setError: assign(({ event }) => {
            if (
                event.type !== "METADATA_FAILED" &&
                event.type !== "EXPORT_FAILED"
            ) {
                return {};
            }
            return { error: event.error };
        }),
        clearError: assign({ error: null }),
        reset: assign(() => initialContext),
    },
}).createMachine({
    id: "kdpWizard",
    initial: "metadata",
    context: initialContext,
    states: {
        metadata: {
            on: {
                METADATA_LOADED: { actions: "setMetadataResult" },
                METADATA_FAILED: {
                    target: "metadataError",
                    actions: "setError",
                },
                ADVANCE: {
                    target: "cover",
                    guard: "canAdvanceFromMetadata",
                },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        metadataError: {
            on: {
                RETRY: {
                    target: "metadata",
                    guard: "canRetry",
                    actions: "clearError",
                },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        cover: {
            on: {
                COVER_VALIDATED: { actions: "setCoverValidated" },
                // C2 direct cover → export. C8 inserts pricing
                // between cover + export; C10 inserts arc between
                // pricing + export.
                ADVANCE: {
                    target: "export",
                    guard: "canAdvanceFromCover",
                },
                BACK: { target: "metadata" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        export: {
            on: {
                GENERATE: { target: "exporting" },
                // C2 BACK from export targets cover directly. C8 /
                // C10 will retarget back through pricing / arc.
                BACK: { target: "cover" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        exporting: {
            on: {
                EXPORT_SUCCESS: {
                    target: "exportSuccess",
                    actions: "setExportResult",
                },
                EXPORT_FAILED: {
                    target: "exportError",
                    actions: "setError",
                },
            },
        },
        exportSuccess: {
            on: {
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        exportError: {
            on: {
                RETRY: {
                    target: "exporting",
                    guard: "canRetry",
                    actions: "clearError",
                },
                BACK: { target: "export", actions: "clearError" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
    },
});
