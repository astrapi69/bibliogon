/**
 * KDP Publishing Wizard — Phase 2 state machine (XState v5).
 *
 * Replaces the Phase 1 ``useState`` step-index in
 * ``KdpPublishingWizard.tsx``. C9 ships the full 5-visible-step
 * Phase 2 navigation (metadata + cover + pricing + arc + export).
 *
 * State graph (C9 — 9 states):
 *
 *   metadata ⇌ metadataError
 *      ↓ ADVANCE (canAdvanceFromMetadata)
 *   cover
 *      ↓ ADVANCE (canAdvanceFromCover)
 *   pricing
 *      ↓ ADVANCE (hasRequiredPricing)
 *   arc
 *      ↓ ADVANCE (unguarded — reviewers are optional)
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
 * ARC reviewer state lives SERVER-SIDE (the C6 CRUD endpoints
 * are the source of truth). The machine's ``arc`` state is just
 * a navigation marker — no ADD_REVIEWER / UPDATE / REMOVE
 * events; ArcStep talks to the server directly.
 *
 * STATE_LOADED / STATE_SAVED events deferred to C10
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
        // C8: pricing requires the user to pick a royalty plan
        // (the calculator-only scope per A2). Other pricing
        // fields stay optional.
        hasRequiredPricing: ({ context }) =>
            context.pricing.royalty_plan !== null,
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
        setPricing: assign(({ context, event }) => {
            if (event.type !== "PRICING_CHANGE") return {};
            return {
                pricing: {
                    ...context.pricing,
                    ...event.pricing,
                    prices: {
                        ...context.pricing.prices,
                        ...(event.pricing.prices ?? {}),
                    },
                },
            };
        }),
        hydratePricing: assign(({ event }) => {
            if (event.type !== "STATE_LOADED") return {};
            // C10: replace pricing context wholesale on initial
            // load from the persisted publishing-state row. Unlike
            // PRICING_CHANGE which merges partials, STATE_LOADED
            // is the boot-time hydration so we overwrite.
            return { pricing: event.pricing };
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
                // C10: persistence hydration on wizard mount. The
                // machine stays at ``metadata`` (user re-validates
                // their book against current metadata) but the
                // pricing context is preloaded from the persisted
                // row. Resume-at-step is filed as a follow-up.
                STATE_LOADED: { actions: "hydratePricing" },
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
                // C8: cover → pricing. C10 will keep this same
                // target + add pricing → arc → export instead of
                // today's pricing → export.
                ADVANCE: {
                    target: "pricing",
                    guard: "canAdvanceFromCover",
                },
                BACK: { target: "metadata" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        pricing: {
            on: {
                PRICING_CHANGE: { actions: "setPricing" },
                ADVANCE: {
                    target: "arc",
                    guard: "hasRequiredPricing",
                },
                BACK: { target: "cover" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        arc: {
            // ARC reviewer state lives server-side (C6 endpoints).
            // No ADD_REVIEWER / UPDATE / REMOVE events on the
            // machine; ArcStep talks to the server directly.
            // ADVANCE is unguarded — reviewers are optional.
            on: {
                ADVANCE: { target: "export" },
                BACK: { target: "pricing" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        export: {
            on: {
                GENERATE: { target: "exporting" },
                BACK: { target: "arc" },
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
                // KDP-WIZARD-UPLOAD-GUIDE-01: after the package is built,
                // ADVANCE to the KDP upload-guide step.
                ADVANCE: { target: "guide" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        guide: {
            on: {
                BACK: { target: "exportSuccess" },
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
