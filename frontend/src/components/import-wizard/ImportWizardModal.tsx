/**
 * Import wizard modal. Shell + step state machine.
 *
 * Parallel to the existing "Import" button on the Dashboard. Runs its
 * own 4-step flow (upload -> detect -> preview -> execute) against the
 * new /api/import/* orchestrator endpoints. No existing import code
 * path is modified; the legacy button still uses /api/backup/smart-import.
 */

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type {
    DetectedProject,
    DuplicateInfo,
    GitAdoption,
    Overrides,
} from "../../api/import";
import type { WizardError } from "./errorContext";
import { WizardErrorBoundary } from "./WizardErrorBoundary";
import { UploadStep } from "./steps/UploadStep";
import { DetectingStep } from "./steps/DetectingStep";
import { PreviewStep } from "./steps/PreviewStep";
import { ExecutingStep } from "./steps/ExecutingStep";
import { SuccessStep } from "./steps/SuccessStep";
import { ErrorStep } from "./steps/ErrorStep";
import { SummaryStep } from "./steps/SummaryStep";
import { PreviewMultiBookStep } from "./steps/PreviewMultiBookStep";

interface WizardInput {
    files: File[];
    paths?: string[];
    /** Set by the git URL path in Step 1; DetectingStep branches
     * to the /api/import/detect/git endpoint when present. */
    gitUrl?: string;
}

export type WizardState =
    | { step: "upload" }
    | { step: "detecting"; input: WizardInput }
    | {
          step: "summary";
          input: WizardInput;
          detected: DetectedProject;
          duplicate: DuplicateInfo;
          tempRef: string;
      }
    | {
          step: "preview";
          input: WizardInput;
          detected: DetectedProject;
          duplicate: DuplicateInfo;
          tempRef: string;
          overrides: Overrides;
          duplicateAction: "create" | "overwrite";
          gitAdoption: GitAdoption;
      }
    | {
          step: "preview-multi";
          input: WizardInput;
          detected: DetectedProject;
          tempRef: string;
          selectedSourceIds: string[];
          perBookDuplicateAction: Record<
              string,
              "skip" | "overwrite" | "create_new"
          >;
      }
    | {
          step: "executing";
          input: WizardInput;
          detected: DetectedProject;
          tempRef: string;
          overrides: Overrides;
          duplicateAction: "create" | "overwrite";
          existingBookId: string | null;
          gitAdoption: GitAdoption;
      }
    | { step: "success"; bookId: string; title: string }
    | {
          step: "error";
          error: WizardError;
          retry?: () => void;
      };

export interface ImportWizardModalProps {
    open: boolean;
    onClose: () => void;
    onImported?: (bookId: string) => void;
}

const STEP_NUMBERS: Record<WizardState["step"], number | null> = {
    upload: 1,
    detecting: 2,
    summary: 2,
    preview: 3,
    "preview-multi": 3,
    executing: 4,
    success: 4,
    error: null,
};

export default function ImportWizardModal({
    open,
    onClose,
    onImported,
}: ImportWizardModalProps) {
    const { t } = useI18n();
    const [state, setState] = useState<WizardState>({ step: "upload" });
    const bodyRef = useRef<HTMLDivElement>(null);

    // Focus the first interactive element in the step body when the
    // step changes. Improves keyboard UX and announces step content
    // to screen readers.
    useEffect(() => {
        if (!open) return;
        const id = window.requestAnimationFrame(() => {
            const el = bodyRef.current?.querySelector<HTMLElement>(
                "[data-autofocus], input, button, [tabindex]:not([tabindex='-1'])",
            );
            el?.focus();
        });
        return () => window.cancelAnimationFrame(id);
    }, [state.step, open]);

    const resetAndClose = () => {
        setState({ step: "upload" });
        onClose();
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) resetAndClose();
    };

    const stepNumber = STEP_NUMBERS[state.step];

    return (
        <Dialog.Root open={open} onOpenChange={handleOpenChange}>
            <Dialog.Portal>
                <Dialog.Overlay className="dialog-overlay" />
                <Dialog.Content
                    className="dialog-content import-wizard-dialog"
                    data-testid="import-wizard-modal"
                    style={{ maxWidth: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
                    aria-describedby={undefined}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "16px 20px",
                            borderBottom: "1px solid var(--border)",
                        }}
                    >
                        <Dialog.Title style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                            {t("ui.import_wizard.title", "Import Book")}
                        </Dialog.Title>
                        {stepNumber !== null && (
                            <span
                                data-testid="wizard-step-indicator"
                                style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}
                            >
                                {t("ui.import_wizard.step_of", "Step {n} of 4").replace(
                                    "{n}",
                                    String(stepNumber),
                                )}
                            </span>
                        )}
                        <Dialog.Close asChild>
                            <button
                                className="btn-icon"
                                data-testid="wizard-close"
                                aria-label={t("ui.common.close", "Close")}
                            >
                                <X size={18} />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div
                        ref={bodyRef}
                        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 20 }}
                    >
                        <WizardErrorBoundary onClose={resetAndClose}>
                        {state.step === "upload" && (
                            <UploadStep
                                onInputSelected={(selection) =>
                                    setState({
                                        step: "detecting",
                                        input: {
                                            files: selection.files,
                                            paths: selection.paths,
                                            gitUrl: selection.gitUrl,
                                        },
                                    })
                                }
                            />
                        )}
                        {state.step === "detecting" && (
                            <DetectingStep
                                files={state.input.files}
                                paths={state.input.paths}
                                gitUrl={state.input.gitUrl}
                                onDetected={(detected, duplicate, tempRef) =>
                                    setState({
                                        step: "summary",
                                        input: state.input,
                                        detected,
                                        duplicate,
                                        tempRef,
                                    })
                                }
                                onError={(error, retry) =>
                                    setState({
                                        step: "error",
                                        error,
                                        retry: () => {
                                            setState({ step: "detecting", input: state.input });
                                            retry?.();
                                        },
                                    })
                                }
                                onCancel={() => setState({ step: "upload" })}
                            />
                        )}
                        {state.step === "summary" && (
                            <SummaryStep
                                detected={state.detected}
                                onBack={() => setState({ step: "upload" })}
                                onNext={() => {
                                    if (state.detected.is_multi_book) {
                                        const sids = (
                                            state.detected.books ?? []
                                        ).map((b) => b.source_identifier);
                                        setState({
                                            step: "preview-multi",
                                            input: state.input,
                                            detected: state.detected,
                                            tempRef: state.tempRef,
                                            selectedSourceIds: sids,
                                            perBookDuplicateAction: {},
                                        });
                                    } else {
                                        setState({
                                            step: "preview",
                                            input: state.input,
                                            detected: state.detected,
                                            duplicate: state.duplicate,
                                            tempRef: state.tempRef,
                                            overrides: {},
                                            duplicateAction: "create",
                                            gitAdoption: "start_fresh",
                                        });
                                    }
                                }}
                            />
                        )}
                        {state.step === "preview" && (
                            <PreviewStep
                                detected={state.detected}
                                duplicate={state.duplicate}
                                overrides={state.overrides}
                                duplicateAction={state.duplicateAction}
                                tempRef={state.tempRef}
                                gitAdoption={state.gitAdoption}
                                onOverridesChange={(overrides) =>
                                    setState({ ...state, overrides })
                                }
                                onDuplicateActionChange={(action) => {
                                    if (action === "cancel") {
                                        resetAndClose();
                                        return;
                                    }
                                    setState({ ...state, duplicateAction: action });
                                }}
                                onGitAdoptionChange={(gitAdoption) =>
                                    setState({ ...state, gitAdoption })
                                }
                                onBack={() => setState({ step: "upload" })}
                                onConfirm={() =>
                                    setState({
                                        step: "executing",
                                        input: state.input,
                                        detected: state.detected,
                                        tempRef: state.tempRef,
                                        overrides: state.overrides,
                                        duplicateAction: state.duplicateAction,
                                        existingBookId:
                                            state.duplicate.existing_book_id ?? null,
                                        gitAdoption: state.gitAdoption,
                                    })
                                }
                            />
                        )}
                        {state.step === "preview-multi" && (
                            <PreviewMultiBookStep
                                detected={state.detected}
                                selection={{
                                    selectedSourceIds: state.selectedSourceIds,
                                    perBookDuplicateAction:
                                        state.perBookDuplicateAction,
                                }}
                                onToggle={(sid) =>
                                    setState({
                                        ...state,
                                        selectedSourceIds:
                                            state.selectedSourceIds.includes(sid)
                                                ? state.selectedSourceIds.filter(
                                                      (id) => id !== sid,
                                                  )
                                                : [...state.selectedSourceIds, sid],
                                    })
                                }
                                onSelectAll={() =>
                                    setState({
                                        ...state,
                                        selectedSourceIds: (
                                            state.detected.books ?? []
                                        ).map((b) => b.source_identifier),
                                    })
                                }
                                onDeselectAll={() =>
                                    setState({
                                        ...state,
                                        selectedSourceIds: [],
                                    })
                                }
                                onSetDuplicateAction={(sid, action) =>
                                    setState({
                                        ...state,
                                        perBookDuplicateAction: {
                                            ...state.perBookDuplicateAction,
                                            [sid]: action,
                                        },
                                    })
                                }
                                onBack={() => setState({ step: "upload" })}
                                onConfirm={() =>
                                    setState({
                                        step: "executing",
                                        input: state.input,
                                        detected: state.detected,
                                        tempRef: state.tempRef,
                                        overrides: {
                                            selected_books:
                                                state.selectedSourceIds,
                                            per_book_duplicate:
                                                state.perBookDuplicateAction as unknown as Record<
                                                    string,
                                                    string
                                                >,
                                        } as unknown as Overrides,
                                        duplicateAction: "create",
                                        existingBookId: null,
                                        gitAdoption: "start_fresh",
                                    })
                                }
                            />
                        )}
                        {state.step === "executing" && (
                            <ExecutingStep
                                tempRef={state.tempRef}
                                overrides={state.overrides}
                                duplicateAction={state.duplicateAction}
                                existingBookId={state.existingBookId}
                                gitAdoption={state.gitAdoption}
                                onSuccess={(bookId) => {
                                    const title =
                                        (typeof state.overrides.title === "string" &&
                                            state.overrides.title) ||
                                        state.detected.title ||
                                        t("ui.import_wizard.untitled_book", "Untitled");
                                    setState({ step: "success", bookId, title });
                                    onImported?.(bookId);
                                }}
                                onError={(error) =>
                                    setState({
                                        step: "error",
                                        error,
                                        retry: () => setState({ ...state }),
                                    })
                                }
                            />
                        )}
                        {state.step === "success" && (
                            <SuccessStep
                                bookId={state.bookId}
                                title={state.title}
                                onClose={resetAndClose}
                                onAnother={() => setState({ step: "upload" })}
                            />
                        )}
                        {state.step === "error" && (
                            <ErrorStep
                                error={state.error}
                                onRetry={state.retry}
                                onClose={resetAndClose}
                            />
                        )}
                        </WizardErrorBoundary>
                    </div>
                    <style>{WIZARD_STYLES}</style>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

const WIZARD_STYLES = `
.import-wizard-dialog { animation: iw-fade-in 160ms ease-out; }
@keyframes iw-fade-in {
    from { opacity: 0; transform: translate(-50%, calc(-50% + 8px)); }
    to { opacity: 1; transform: translate(-50%, -50%); }
}
@media (prefers-reduced-motion: reduce) {
    .import-wizard-dialog { animation: none; }
    .import-wizard-spin { animation: none !important; }
}
@media (max-width: 640px) {
    .preview-panel .preview-panel-grid {
        grid-template-columns: 1fr !important;
    }
}
`;
