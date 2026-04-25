import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { detectGitImport, detectImport } from "../../../api/import";
import type { DetectedProject, DuplicateInfo } from "../../../api/import";
import { useI18n } from "../../../hooks/useI18n";
import { toWizardError, type WizardError } from "../errorContext";

const ROTATE_KEYS = [
    ["ui.import_wizard.status_reading", "Reading file..."],
    ["ui.import_wizard.status_detecting", "Detecting format..."],
    ["ui.import_wizard.status_parsing", "Parsing structure..."],
    ["ui.import_wizard.status_checking", "Checking for duplicates..."],
] as const;

// Minimum time the spinner is visible even when detect resolves
// faster. Keeps the transition into Step 2 Summary deliberate -
// without this a cached detect flashes the spinner imperceptibly
// and the user misses the cue that analysis ran. 300ms is shorter
// than the earlier 600ms because Summary (the next step) is now
// itself a deliberate acknowledgment step; the spinner only needs
// to register as present.
const MIN_VISIBLE_MS = 300;

export function DetectingStep({
    file,
    files,
    paths,
    gitUrl,
    onDetected,
    onError,
    onCancel,
}: {
    file?: File;
    files?: File[];
    paths?: string[];
    gitUrl?: string;
    onDetected: (
        detected: DetectedProject,
        duplicate: DuplicateInfo,
        tempRef: string,
    ) => void;
    onError: (error: WizardError, retry?: () => void) => void;
    onCancel: () => void;
}) {
    const { t } = useI18n();
    const [statusIdx, setStatusIdx] = useState(0);
    const cancelledRef = useRef(false);

    useEffect(() => {
        cancelledRef.current = false;
        let mounted = true;

        const rotate = window.setInterval(() => {
            if (!mounted) return;
            setStatusIdx((i) => (i + 1) % ROTATE_KEYS.length);
        }, 1200);

        const startedAt = Date.now();
        const detection: Promise<
            Awaited<ReturnType<typeof detectImport>>
        > = gitUrl
            ? detectGitImport(gitUrl)
            : detectImport(
                  (files && files.length > 0
                      ? files
                      : file
                        ? file
                        : (files ?? [])) as File | File[],
                  paths,
              );

        const minDelay = (): Promise<void> => {
            const elapsed = Date.now() - startedAt;
            const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
            return remaining > 0
                ? new Promise((resolve) => window.setTimeout(resolve, remaining))
                : Promise.resolve();
        };

        detection
            .then(async (response) => {
                await minDelay();
                if (cancelledRef.current || !mounted) return;
                onDetected(response.detected, response.duplicate, response.temp_ref);
            })
            .catch(async (err: unknown) => {
                // Still respect the minimum visible time on error so
                // the error step does not flash into view either.
                await minDelay();
                if (cancelledRef.current || !mounted) return;
                const wizardError = toWizardError(
                    err,
                    gitUrl ? "git-clone" : "detect",
                    /* retryable= */ true,
                );
                onError(wizardError);
            });

        return () => {
            mounted = false;
            window.clearInterval(rotate);
        };
    }, [file, files, paths, gitUrl, onDetected, onError]);

    return (
        <div
            data-testid="detecting-step"
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                padding: "40px 0",
            }}
        >
            <Loader2
                size={40}
                className="import-wizard-spin"
                style={{
                    color: "var(--accent)",
                    animation: "spin 1s linear infinite",
                }}
            />
            <p style={{ margin: 0, fontSize: "0.9375rem" }}>
                {t(ROTATE_KEYS[statusIdx][0], ROTATE_KEYS[statusIdx][1])}
            </p>
            <p
                style={{
                    margin: 0,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    maxWidth: 400,
                    textAlign: "center",
                }}
            >
                {gitUrl
                    ? gitUrl
                    : file
                      ? file.name
                      : files && files.length > 0
                        ? `${files.length} files`
                        : ""}
            </p>
            <button
                className="btn btn-secondary btn-sm"
                data-testid="detecting-cancel"
                onClick={() => {
                    cancelledRef.current = true;
                    onCancel();
                }}
            >
                {t("ui.common.cancel", "Cancel")}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}
