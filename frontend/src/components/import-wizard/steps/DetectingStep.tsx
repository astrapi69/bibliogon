import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "../../../api/client";
import { detectImport } from "../../../api/import";
import type { DetectedProject, DuplicateInfo } from "../../../api/import";
import { useI18n } from "../../../hooks/useI18n";

const ROTATE_KEYS = [
    ["ui.import_wizard.status_reading", "Reading file..."],
    ["ui.import_wizard.status_detecting", "Detecting format..."],
    ["ui.import_wizard.status_parsing", "Parsing structure..."],
    ["ui.import_wizard.status_checking", "Checking for duplicates..."],
] as const;

export function DetectingStep({
    file,
    files,
    paths,
    onDetected,
    onError,
    onCancel,
}: {
    file?: File;
    files?: File[];
    paths?: string[];
    onDetected: (
        detected: DetectedProject,
        duplicate: DuplicateInfo,
        tempRef: string,
    ) => void;
    onError: (message: string, retry?: () => void) => void;
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

        const input: File | File[] =
            files && files.length > 0
                ? files
                : file
                  ? file
                  : (files ?? []);

        detectImport(input as File | File[], paths)
            .then((response) => {
                if (cancelledRef.current || !mounted) return;
                onDetected(response.detected, response.duplicate, response.temp_ref);
            })
            .catch((err: unknown) => {
                if (cancelledRef.current || !mounted) return;
                const message =
                    err instanceof ApiError
                        ? err.detail
                        : err instanceof Error
                          ? err.message
                          : String(err);
                onError(message);
            });

        return () => {
            mounted = false;
            window.clearInterval(rotate);
        };
    }, [file, files, paths, onDetected, onError]);

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
                {file
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
