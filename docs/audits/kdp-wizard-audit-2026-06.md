# KDP Publishing Wizard — gap audit (2026-06)

Audit of the existing KDP Publishing Wizard
(`frontend/src/components/kdp-wizard/`, XState v5) against the 4-step
KDP-publishing spec. Scope: identify genuinely-missing steps as
**additive** work (no rebuild). The wizard is real and substantial —
this audit deliberately does NOT duplicate it.

## Existing wizard (5 steps)

`kdpWizardMachine` (`machines/kdpWizardMachine.ts`) drives:

| # | State | Component | Purpose |
|---|---|---|---|
| 0 | `metadata` | `MetadataChecklist.tsx` | Validate KDP-required metadata (title/author/description/category/ISBN), green-check list |
| 1 | `cover` | `CoverValidation.tsx` | Validate the cover image (required for KDP) |
| 2 | `pricing` | `PricingStep.tsx` | Royalty plan + per-region prices + paperback page-count |
| 3 | `arc` | `ArcStep.tsx` | ARC reviewer tracking (beyond the spec) |
| 4 | `export` | `ExportPackage.tsx` | `POST /api/kdp/package/{id}` → ZIP (manuscript epub+pdf, cover, metadata, cover-validation report) |

Price calculator is implemented in `pricing.ts`:
`computePaperbackPrintCost(pageCount, ink)`, `computePaperbackRoyalty`,
`estimatePageCount(chapterCount)`, plus the ebook royalty 35/70 plans.

## Spec vs reality

| Spec step | Status | Evidence |
|---|---|---|
| 1. Metadata-Prüfung (completeness, ISBN, cover required, green checks) | ✅ exists | `MetadataChecklist` + `CoverValidation` |
| 2. Format wählen (eBook EPUB/KPF · Taschenbuch PDF mit Beschnitt · Hardcover PDF · Trim-Size · Margins) | ❌ **GAP** | No format-choice step; export bundles epub+pdf unconditionally; zero `trim-size`/`margin`/`bleed` in `kdp-wizard/`. Hardcover is only a metadata/pricing flag (`hardcover_export`). |
| 3. Export generieren + Vorschau | ✅ exists (preview minimal) | `ExportPackage` → ZIP; "Vorschau" is download-only |
| 4a. Preis-Kalkulator (Seitenzahl → Druckkosten → Min-Preis) | ✅ exists — **not a gap** | `pricing.ts` + `PricingStep` |
| 4b. KDP-Anleitung (kdp.amazon.com link + step-by-step which-file-where) | ❌ **GAP** | Only a one-line `export_hint`; no link, no walkthrough |
| (bonus) ARC reviewer tracking | ✅ exists, beyond spec | `ArcStep` |

## Genuine gaps (both additive — filed)

1. **`KDP-WIZARD-FORMAT-STEP-01` (#580)** — a format-selection step
   (eBook/Taschenbuch/Hardcover) + trim-size + margins, between `cover`
   and `pricing`. The choice flows through machine context and is
   consumed by the KDP guide. Per-format PDF re-rendering with applied
   bleed/trim is a noted follow-up (the document-export pipeline already
   has format+bleed params from PDF-KDP-FORMATS-01 / PDF-BLEED-MARKS-01;
   the KDP *package* builder does not yet thread them).
2. **`KDP-WIZARD-UPLOAD-GUIDE-01` (#581)** — a final KDP upload-guide
   step (after `export`): `kdp.amazon.com` link + ordered walkthrough
   (create title → upload manuscript → upload cover → enter metadata →
   set price), reflecting the chosen format where available.

Both are scoped as new states on the existing `kdpWizardMachine` — new
step components + i18n + tests — **not** a rebuild of the wizard.
