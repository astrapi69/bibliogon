import type { DetectedProject, DuplicateInfo } from "../../../api/import";

export function DetectingStep({
    file,
    onDetected,
    onError,
    onCancel,
}: {
    file: File;
    onDetected: (detected: DetectedProject, duplicate: DuplicateInfo, tempRef: string) => void;
    onError: (message: string, retry?: () => void) => void;
    onCancel: () => void;
}) {
    // Placeholder: the real implementation in the next commit calls
    // /api/import/detect and rotates status messages. For now the
    // scaffold just exposes the transition handlers for wiring tests.
    void file;
    void onDetected;
    void onError;
    return (
        <div data-testid="detecting-step">
            <p>Detecting...</p>
            <button onClick={onCancel} data-testid="detecting-cancel">
                Cancel
            </button>
        </div>
    );
}
