/**
 * Wizard error context helpers.
 *
 * The wizard's state machine carries a single ``WizardError`` shape
 * regardless of whether the failure was a render crash, a network
 * exception, or a backend ``ApiError``. ``formatDetails`` produces
 * the clipboard payload that the user pastes into a GitHub issue.
 */

import { ApiError } from "../../api/client";

export interface WizardError {
    /** Short human-readable message rendered in the dialog body. */
    message: string;
    /** Wizard step that failed: upload | detect | preview | execute |
     *  render. Pre-fill for the GitHub issue context section. */
    context: string;
    /** Original Error/ApiError when available — keeps stack trace +
     *  endpoint + status accessible for the Copy details payload. */
    cause?: unknown;
    /** When true the ErrorStep renders a Retry button. */
    retryable: boolean;
}

const APP_VERSION = "0.22.0";

/** Convert anything thrown into a WizardError. */
export function toWizardError(
    err: unknown,
    context: string,
    retryable: boolean = false,
): WizardError {
    if (err instanceof ApiError) {
        return {
            message: err.detail || err.message || "Unknown API error",
            context,
            cause: err,
            retryable,
        };
    }
    if (err instanceof Error) {
        return {
            message: err.message,
            context,
            cause: err,
            retryable,
        };
    }
    return {
        message: String(err),
        context,
        cause: err,
        retryable,
    };
}

/** Build the clipboard payload for the Copy details button. */
export function formatDetails(error: WizardError): string {
    const lines: string[] = [];
    lines.push(`# Bibliogon import error`);
    lines.push("");
    lines.push(`**Failed at:** ${error.context}`);
    lines.push(`**Message:** ${error.message}`);
    lines.push(`**Bibliogon version:** ${APP_VERSION}`);
    lines.push(
        `**Browser:** ${
            typeof navigator !== "undefined"
                ? navigator.userAgent
                : "unknown"
        }`,
    );
    lines.push(
        `**Route:** ${
            typeof window !== "undefined"
                ? window.location.pathname
                : "unknown"
        }`,
    );
    if (error.cause instanceof ApiError) {
        lines.push("");
        lines.push("## API context");
        lines.push(`- Status: ${error.cause.status}`);
        lines.push(
            `- Endpoint: ${error.cause.method} ${error.cause.endpoint}`,
        );
        lines.push(`- Timestamp: ${error.cause.timestamp}`);
        if (error.cause.stacktrace) {
            lines.push("");
            lines.push("```");
            lines.push(error.cause.stacktrace.slice(0, 4000));
            lines.push("```");
        }
    } else if (error.cause instanceof Error && error.cause.stack) {
        lines.push("");
        lines.push("## Stack trace");
        lines.push("```");
        lines.push(error.cause.stack.slice(0, 4000));
        lines.push("```");
    }
    return lines.join("\n");
}

/** Pre-fill a GitHub Issues URL with the formatted details. */
export function buildGithubIssueUrl(error: WizardError): string {
    const repo = "astrapi69/bibliogon";
    const title = encodeURIComponent(
        `[Import] ${error.context}: ${error.message.slice(0, 80)}`,
    );
    const body = encodeURIComponent(formatDetails(error));
    // GitHub URL cap is ~8KB. Trim if needed.
    let url = `https://github.com/${repo}/issues/new?title=${title}&body=${body}&labels=bug`;
    while (url.length > 7800 && body.length > 200) {
        const trimmed = formatDetails(error).slice(
            0,
            Math.floor(formatDetails(error).length * 0.8),
        );
        url = `https://github.com/${repo}/issues/new?title=${title}&body=${encodeURIComponent(trimmed)}&labels=bug`;
        if (url.length <= 7800) break;
        break;
    }
    return url;
}
