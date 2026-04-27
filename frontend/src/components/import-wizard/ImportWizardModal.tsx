/**
 * Import wizard modal. Shell + step state machine.
 *
 * Parallel to the existing "Import" button on the Dashboard. Runs its
 * own 4-step flow (upload -> detect -> preview -> execute) against the
 * new /api/import/* orchestrator endpoints. No existing import code
 * path is modified; the legacy button still uses /api/backup/smart-import.
 *
 * State + transitions live in ``machines/wizardMachine.ts`` (XState v5).
 * This file is a thin renderer that subscribes via ``useMachine`` and
 * forwards step-component callbacks as machine events. Async network
 * calls remain inside the per-step components (DetectingStep,
 * ExecutingStep) which dispatch the resulting events back to the
 * machine via the callbacks supplied here.
 */

import { useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useI18n } from "../../hooks/useI18n";
import type { Overrides } from "../../api/import";
import { wizardMachine } from "./machines/wizardMachine";
import { WizardErrorBoundary } from "./WizardErrorBoundary";
import { UploadStep } from "./steps/UploadStep";
import { DetectingStep } from "./steps/DetectingStep";
import { PreviewStep } from "./steps/PreviewStep";
import { ExecutingStep } from "./steps/ExecutingStep";
import { SuccessStep } from "./steps/SuccessStep";
import { SuccessMultiStep } from "./steps/SuccessMultiStep";
import { ErrorStep } from "./steps/ErrorStep";
import { SummaryStep } from "./steps/SummaryStep";
import { PreviewMultiBookStep } from "./steps/PreviewMultiBookStep";

export interface ImportWizardModalProps {
    open: boolean;
    onClose: () => void;
    onImported?: (bookId: string) => void;
}

type StepName =
    | "upload"
    | "detecting"
    | "summary"
    | "previewSingleBook"
    | "previewMultiBook"
    | "executing"
    | "success"
    | "error";

const STEP_NUMBERS: Record<StepName, number | null> = {
    upload: 1,
    detecting: 2,
    summary: 2,
    previewSingleBook: 3,
    previewMultiBook: 3,
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
    const [snapshot, send] = useMachine(wizardMachine);
    const bodyRef = useRef<HTMLDivElement>(null);
    const importedRef = useRef<string | null>(null);

    const stepName = snapshot.value as StepName;
    const ctx = snapshot.context;

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
    }, [stepName, open]);

    // Fire onImported exactly once per successful execute - the machine
    // re-enters "success" on RESET-then-import so we keep a ref to the
    // book id we already announced.
    useEffect(() => {
        if (stepName !== "success") {
            importedRef.current = null;
            return;
        }
        if (ctx.bookId && importedRef.current !== ctx.bookId) {
            importedRef.current = ctx.bookId;
            onImported?.(ctx.bookId);
        }
    }, [stepName, ctx.bookId, onImported]);

    const resetAndClose = () => {
        send({ type: "RESET" });
        onClose();
    };

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) resetAndClose();
    };

    const stepNumber = STEP_NUMBERS[stepName];

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
                        {stepName === "upload" && (
                            <UploadStep
                                onInputSelected={(selection) => {
                                    if (selection.gitUrl) {
                                        send({
                                            type: "SELECT_GIT_URL",
                                            url: selection.gitUrl,
                                        });
                                    } else {
                                        send({
                                            type: "SELECT_FILE",
                                            files: selection.files,
                                            paths: selection.paths,
                                        });
                                    }
                                }}
                            />
                        )}
                        {stepName === "detecting" && ctx.input && (
                            <DetectingStep
                                files={ctx.input.kind === "file" ? ctx.input.files : []}
                                paths={
                                    ctx.input.kind === "file"
                                        ? ctx.input.paths
                                        : undefined
                                }
                                gitUrl={
                                    ctx.input.kind === "git-url"
                                        ? ctx.input.url
                                        : undefined
                                }
                                onDetected={(detected, duplicate, tempRef) =>
                                    send({
                                        type: "DETECTION_COMPLETE",
                                        detected,
                                        duplicate,
                                        tempRef,
                                    })
                                }
                                onError={(error) =>
                                    send({ type: "DETECTION_FAILED", error })
                                }
                                onCancel={() => send({ type: "CANCEL" })}
                            />
                        )}
                        {stepName === "summary" && ctx.detected && (
                            <SummaryStep
                                detected={ctx.detected}
                                onBack={() => send({ type: "CANCEL" })}
                                onNext={() => send({ type: "ADVANCE_FROM_SUMMARY" })}
                            />
                        )}
                        {stepName === "previewSingleBook" &&
                            ctx.detected &&
                            ctx.duplicate &&
                            ctx.tempRef && (
                                <PreviewStep
                                    detected={ctx.detected}
                                    duplicate={ctx.duplicate}
                                    overrides={ctx.overrides}
                                    duplicateAction={ctx.duplicateAction}
                                    tempRef={ctx.tempRef}
                                    gitAdoption={ctx.gitAdoption}
                                    onOverridesChange={(overrides) =>
                                        send({
                                            type: "OVERRIDES_CHANGE",
                                            overrides,
                                        })
                                    }
                                    onDuplicateActionChange={(action) => {
                                        if (action === "cancel") {
                                            resetAndClose();
                                            return;
                                        }
                                        send({
                                            type: "DUPLICATE_ACTION_CHANGE",
                                            action,
                                        });
                                    }}
                                    onGitAdoptionChange={(choice) =>
                                        send({
                                            type: "GIT_ADOPTION_CHANGE",
                                            choice,
                                        })
                                    }
                                    onBack={() => send({ type: "CANCEL" })}
                                    onConfirm={() => send({ type: "EXECUTE" })}
                                />
                            )}
                        {stepName === "previewMultiBook" && ctx.detected && (
                            <PreviewMultiBookStep
                                detected={ctx.detected}
                                selection={{
                                    selectedSourceIds:
                                        ctx.multiBookSelection.selectedSourceIds,
                                    perBookDuplicateAction:
                                        ctx.multiBookSelection
                                            .perBookDuplicateAction,
                                }}
                                onToggle={(sid) =>
                                    send({
                                        type: "TOGGLE_BOOK_SELECTION",
                                        sourceId: sid,
                                    })
                                }
                                onSelectAll={() =>
                                    send({ type: "SELECT_ALL_BOOKS" })
                                }
                                onDeselectAll={() =>
                                    send({ type: "DESELECT_ALL_BOOKS" })
                                }
                                onSetDuplicateAction={(sid, action) =>
                                    send({
                                        type: "SET_PER_BOOK_DUPLICATE_ACTION",
                                        sourceId: sid,
                                        action,
                                    })
                                }
                                onBack={() => send({ type: "CANCEL" })}
                                onConfirm={() => send({ type: "EXECUTE" })}
                            />
                        )}
                        {stepName === "executing" &&
                            ctx.detected &&
                            ctx.tempRef && (
                                <ExecutingStep
                                    tempRef={ctx.tempRef}
                                    overrides={buildExecuteOverrides(ctx)}
                                    duplicateAction={ctx.duplicateAction}
                                    existingBookId={
                                        ctx.duplicate?.existing_book_id ?? null
                                    }
                                    gitAdoption={ctx.gitAdoption}
                                    onSuccess={(bookId, bookIds) => {
                                        const title =
                                            (typeof ctx.overrides.title ===
                                                "string" &&
                                                ctx.overrides.title) ||
                                            ctx.detected?.title ||
                                            t(
                                                "ui.import_wizard.untitled_book",
                                                "Untitled",
                                            );
                                        send({
                                            type: "EXECUTE_SUCCESS",
                                            bookId,
                                            bookIds,
                                            title,
                                        });
                                    }}
                                    onError={(error) =>
                                        send({ type: "EXECUTE_FAILED", error })
                                    }
                                />
                            )}
                        {stepName === "success" &&
                            (ctx.importedBookIds.length > 1 &&
                            ctx.detected?.is_multi_book ? (
                                <SuccessMultiStep
                                    bookIds={ctx.importedBookIds}
                                    books={ctx.detected.books ?? []}
                                    onClose={resetAndClose}
                                    onAnother={() =>
                                        send({ type: "RESET" })
                                    }
                                />
                            ) : (
                                ctx.bookId && (
                                    <SuccessStep
                                        bookId={ctx.bookId}
                                        title={ctx.title}
                                        onClose={resetAndClose}
                                        onAnother={() =>
                                            send({ type: "RESET" })
                                        }
                                    />
                                )
                            ))}
                        {stepName === "error" && ctx.error && (
                            <ErrorStep
                                error={ctx.error}
                                onRetry={
                                    ctx.error.retryable
                                        ? () => send({ type: "RETRY" })
                                        : undefined
                                }
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

/** Multi-book branch piggybacks on the same Overrides payload by
 * stuffing ``selected_books`` + ``per_book_duplicate``; the single-book
 * branch sends the per-field overrides as-is. */
function buildExecuteOverrides(ctx: {
    overrides: Overrides;
    detected: { is_multi_book?: boolean } | null;
    multiBookSelection: {
        selectedSourceIds: string[];
        perBookDuplicateAction: Record<string, string>;
    };
}): Overrides {
    if (!ctx.detected?.is_multi_book) {
        return ctx.overrides;
    }
    return {
        selected_books: ctx.multiBookSelection.selectedSourceIds,
        per_book_duplicate:
            ctx.multiBookSelection.perBookDuplicateAction,
    } as unknown as Overrides;
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
