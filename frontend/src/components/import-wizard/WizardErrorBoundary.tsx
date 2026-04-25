/**
 * Render-time error boundary for the import wizard.
 *
 * Catches synchronous render exceptions (a hook crashing on an
 * unexpected DetectedProject shape, a missing translation key
 * blowing up a string template, etc.) so the whole wizard does
 * NOT blank out without an error dialog. Async errors are still
 * caught at each step (DetectingStep / ExecutingStep) and routed
 * through the same ErrorStep surface.
 *
 * On error: renders ErrorStep with a synthesized WizardError that
 * includes the React error + componentStack so the user can copy
 * the bundle and report the issue.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorStep } from "./steps/ErrorStep";
import { toWizardError, type WizardError } from "./errorContext";

interface Props {
    children: ReactNode;
    onClose: () => void;
}

interface State {
    error: WizardError | null;
}

export class WizardErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(err: unknown): State {
        return { error: toWizardError(err, "render", false) };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // Augment the cause's stack with the React component stack
        // so the Copy details payload includes both call stacks.
        if (error.stack && info.componentStack) {
            error.stack = `${error.stack}\n\nComponent stack:${info.componentStack}`;
        }
        // eslint-disable-next-line no-console
        console.error("WizardErrorBoundary caught:", error, info);
    }

    handleClose = (): void => {
        this.setState({ error: null });
        this.props.onClose();
    };

    render(): ReactNode {
        if (this.state.error) {
            return (
                <div data-testid="wizard-error-boundary">
                    <ErrorStep
                        error={this.state.error}
                        onClose={this.handleClose}
                    />
                </div>
            );
        }
        return this.props.children;
    }
}
