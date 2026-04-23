import type { DuplicateAction, Overrides } from "../../../api/import";

export function ExecutingStep({
    tempRef,
    overrides,
    duplicateAction,
    existingBookId,
    onSuccess,
    onError,
}: {
    tempRef: string;
    overrides: Overrides;
    duplicateAction: DuplicateAction;
    existingBookId: string | null;
    onSuccess: (bookId: string) => void;
    onError: (message: string) => void;
}) {
    void tempRef;
    void overrides;
    void duplicateAction;
    void existingBookId;
    void onSuccess;
    void onError;
    return (
        <div data-testid="executing-step">
            <p>Executing...</p>
        </div>
    );
}
