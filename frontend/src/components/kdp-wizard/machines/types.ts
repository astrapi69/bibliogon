/**
 * KDP Publishing Wizard — Phase 2 machine types.
 *
 * Co-located with ``kdpWizardMachine.ts`` per the canonical
 * ``frontend/src/components/import-wizard/machines/wizardMachine.ts``
 * convention. Pure type module; zero React imports.
 *
 * Type origins:
 *   - ``KdpMetadataCheckResult`` / ``KdpMetadataIssue``: existing
 *     Phase 1 types from ``frontend/src/api/client.ts``.
 *   - Everything else is new for Phase 2 and lives here.
 *
 * ``ImageDimensions`` + ``ValidationIssue`` are shaped identically
 * to the inline types in ``CoverValidation.tsx``. C2 refactors
 * that component to import from here instead.
 */

import type {
    KdpMetadataCheckResult,
    KdpMetadataIssue,
} from "../../../api/client";

// --- Region / currency / pricing primitives (Track 3) -------------

export type RegionCode = "US" | "EU" | "UK" | "JP" | "IN";
export type CurrencyCode = "USD" | "EUR" | "GBP" | "JPY" | "INR";
export type RoyaltyPlan = "35" | "70";

export interface PriceEntry {
    currency: CurrencyCode;
    list_price: number;
    /** Paperback only. Optional override; default derived from
     *  chapter count in the React layer. */
    page_count?: number;
}

export interface PricingState {
    royalty_plan: RoyaltyPlan | null;
    kdp_select_enrolled: boolean;
    expanded_distribution: boolean;
    prices: Partial<Record<RegionCode, PriceEntry>>;
}

// --- ARC reviewer (Track 4) --------------------------------------

export type ReviewStatus =
    | "invited"
    | "sent"
    | "received"
    | "reviewed"
    | "declined";

export interface ArcReviewer {
    id: string;
    reviewer_name: string;
    reviewer_email: string | null;
    review_status: ReviewStatus;
    copy_version: string | null;
    review_permalink: string | null;
    review_text_excerpt: string | null;
    invited_at: string | null;
    reviewed_at: string | null;
}

export interface NewArcReviewer {
    reviewer_name: string;
    reviewer_email?: string | null;
}

// --- Cover validation (parallel to CoverValidation.tsx) ----------

export interface ImageDimensions {
    width: number;
    height: number;
}

export interface ValidationIssue {
    field: string;
    severity: "error" | "warning";
    message: string;
}

// --- Wizard error shape ------------------------------------------

export interface KdpWizardError {
    message: string;
    context: "metadata" | "cover" | "pricing" | "arc" | "export";
    retryable: boolean;
}

// --- Machine context + events ------------------------------------

/**
 * C8 scope: ``KdpWizardContext`` + ``KdpWizardEvent`` cover
 * the 4 visible steps (metadata + cover + pricing + export)
 * plus their error sub-states. C10 will extend with the ``arc``
 * state + ArcReviewer context field. The ``ArcReviewer`` type
 * primitives above stay defined as forward-compat for C10.
 *
 * History: C2 pruned pricing+arc from the machine (Option C
 * adjudication — "machine state reflects current reality").
 * C8 re-adds pricing now that its UI ships.
 */
export interface KdpWizardContext {
    // Step 1 — metadata:
    metadataResult: KdpMetadataCheckResult | null;
    metadataIssuesFiltered: KdpMetadataIssue[];

    // Step 2 — cover:
    coverDimensions: ImageDimensions | null;
    coverIssues: ValidationIssue[];

    // Step 3 — pricing (C8):
    pricing: PricingState;

    // Step 4 — export:
    exportFilename: string | null;
    exportBlobUrl: string | null;

    // Retryable error surface (any state):
    error: KdpWizardError | null;
}

export type KdpWizardEvent =
    // Step-1 outcomes:
    | {
          type: "METADATA_LOADED";
          result: KdpMetadataCheckResult;
          issuesFiltered: KdpMetadataIssue[];
      }
    | { type: "METADATA_FAILED"; error: KdpWizardError }
    // Step-2 outcomes:
    | {
          type: "COVER_VALIDATED";
          dim: ImageDimensions;
          issues: ValidationIssue[];
      }
    // Step-3 (pricing, C8):
    | { type: "PRICING_CHANGE"; pricing: Partial<PricingState> }
    // Step-4 (export):
    | { type: "GENERATE" }
    | { type: "EXPORT_SUCCESS"; filename: string; blobUrl: string }
    | { type: "EXPORT_FAILED"; error: KdpWizardError }
    // Navigation:
    | { type: "ADVANCE" }
    | { type: "BACK" }
    // Recovery:
    | { type: "RETRY" }
    | { type: "CANCEL" }
    | { type: "RESET" };

// --- Initial context ----------------------------------------------

export const initialContext: KdpWizardContext = {
    metadataResult: null,
    metadataIssuesFiltered: [],
    coverDimensions: null,
    coverIssues: [],
    pricing: {
        royalty_plan: null,
        kdp_select_enrolled: false,
        expanded_distribution: false,
        prices: {},
    },
    exportFilename: null,
    exportBlobUrl: null,
    error: null,
};
