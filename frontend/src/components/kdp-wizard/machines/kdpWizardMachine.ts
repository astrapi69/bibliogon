/**
 * KDP Publishing Wizard — Phase 2 state machine (XState v5).
 *
 * Replaces the Phase 1 ``useState`` step-index in
 * ``KdpPublishingWizard.tsx``. Foundation for the Phase 2 feature
 * surface (pricing + ARC + persistence) per
 * ``docs/audits/kdp-publishing-wizard-phase-2-pre-inspection-2026-05-22.md``.
 *
 * State graph:
 *
 *   metadata → metadataError ←→ metadata
 *      ↓
 *   cover  →  metadata (BACK)
 *      ↓
 *   pricing  →  cover (BACK)
 *      ↓
 *   arc  →  pricing (BACK)
 *      ↓
 *   export  →  arc (BACK)
 *      ↓ GENERATE
 *   exporting
 *      ↓
 *   exportSuccess  →  closed (FINISH)
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
 * (persistence wiring); Phase 2 C1 ships the navigation
 * substrate only.
 */

import { setup, assign } from "xstate";

import {
    initialContext,
    type ArcReviewer,
    type KdpWizardContext,
    type KdpWizardEvent,
} from "./types";

export const kdpWizardMachine = setup({
    types: {} as {
        context: KdpWizardContext;
        events: KdpWizardEvent;
    },
    guards: {
        canAdvanceFromMetadata: ({ context }) =>
            !context.metadataIssuesFiltered.some(
                (i) => i.severity === "error",
            ),
        canAdvanceFromCover: ({ context }) =>
            !context.coverIssues.some((i) => i.severity === "error"),
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
        addReviewer: assign(({ context, event }) => {
            if (event.type !== "ADD_REVIEWER") return {};
            const now = new Date().toISOString();
            const reviewer: ArcReviewer = {
                id: event.id,
                reviewer_name: event.reviewer.reviewer_name,
                reviewer_email: event.reviewer.reviewer_email ?? null,
                review_status: "invited",
                copy_version: null,
                review_permalink: null,
                review_text_excerpt: null,
                invited_at: now,
                reviewed_at: null,
            };
            return {
                arcReviewers: [...context.arcReviewers, reviewer],
            };
        }),
        updateReviewerStatus: assign(({ context, event }) => {
            if (event.type !== "UPDATE_REVIEWER_STATUS") return {};
            const reviewedAt =
                event.status === "reviewed"
                    ? new Date().toISOString()
                    : null;
            return {
                arcReviewers: context.arcReviewers.map((r) =>
                    r.id === event.id
                        ? {
                              ...r,
                              review_status: event.status,
                              review_permalink:
                                  event.permalink ?? r.review_permalink,
                              review_text_excerpt:
                                  event.excerpt ?? r.review_text_excerpt,
                              reviewed_at: reviewedAt ?? r.reviewed_at,
                          }
                        : r,
                ),
            };
        }),
        removeReviewer: assign(({ context, event }) => {
            if (event.type !== "REMOVE_REVIEWER") return {};
            return {
                arcReviewers: context.arcReviewers.filter(
                    (r) => r.id !== event.id,
                ),
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
            on: {
                ADD_REVIEWER: { actions: "addReviewer" },
                UPDATE_REVIEWER_STATUS: {
                    actions: "updateReviewerStatus",
                },
                REMOVE_REVIEWER: { actions: "removeReviewer" },
                ADVANCE: { target: "export" },
                BACK: { target: "pricing" },
                CANCEL: { target: "metadata", actions: "reset" },
            },
        },
        export: {
            on: {
                GENERATE: { target: "exporting" },
                BACK: { target: "arc" },
                FINISH: { target: "closed" },
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
                FINISH: { target: "closed" },
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
        closed: {
            type: "final",
        },
    },
});
