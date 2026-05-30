/**
 * App-surface render-error boundary (coverage-audit BUG-2).
 *
 * Before this, the only error boundary in the app was the
 * import-wizard one; a render-time throw anywhere else (BookEditor,
 * ArticleEditor, Settings, Dashboard, ArticleList, and the page-based
 * editors / Storyboard mounted inside BookEditor) unmounted the whole
 * React tree to a blank white screen with no recovery.
 *
 * Each major route is wrapped in <ErrorBoundary surface="...">; a
 * crash in one surface shows a friendly fallback (localized message +
 * Reload button) instead of blanking the entire app.
 *
 * React error boundaries MUST be class components (no hook equivalent
 * for getDerivedStateFromError / componentDidCatch). The i18n strings
 * are resolved by the functional <ErrorBoundary> wrapper and passed in
 * as props, since the class itself cannot call useI18n().
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

import { useI18n } from "../hooks/useI18n";

interface InnerProps {
    children: ReactNode;
    title: string;
    message: string;
    reloadLabel: string;
    testId: string;
}

interface InnerState {
    hasError: boolean;
}

class ErrorBoundaryInner extends Component<InnerProps, InnerState> {
    state: InnerState = { hasError: false };

    static getDerivedStateFromError(): InnerState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Developer-facing: surface the crash + component stack in the
        // console for diagnosis. User-facing recovery is the fallback.
        console.error(
            `ErrorBoundary[${this.props.testId}] caught:`,
            error,
            info.componentStack,
        );
    }

    render(): ReactNode {
        if (!this.state.hasError) return this.props.children;
        return (
            <div
                className="card card-padded"
                data-testid={this.props.testId}
                role="alert"
            >
                <h2>{this.props.title}</h2>
                <p>{this.props.message}</p>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => window.location.reload()}
                    data-testid={`${this.props.testId}-reload`}
                >
                    {this.props.reloadLabel}
                </button>
            </div>
        );
    }
}

interface Props {
    children: ReactNode;
    /** Short surface id for the test-id + console label, e.g.
     *  "book-editor", "settings", "dashboard". */
    surface: string;
}

export default function ErrorBoundary({ children, surface }: Props) {
    const { t } = useI18n();
    return (
        <ErrorBoundaryInner
            testId={`error-boundary-${surface}`}
            title={t("ui.error_boundary.title", "Etwas ist schiefgelaufen")}
            message={t(
                "ui.error_boundary.message",
                "In diesem Bereich ist ein unerwarteter Fehler aufgetreten. Lade die Seite neu, um fortzufahren.",
            )}
            reloadLabel={t("ui.error_boundary.reload", "Neu laden")}
        >
            {children}
        </ErrorBoundaryInner>
    );
}
