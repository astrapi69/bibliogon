import {useState, useEffect, useCallback, createContext, useContext} from "react";
import {api} from "../api/client";
import {useI18n} from "../hooks/useI18n";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import {X, AlertTriangle, CheckCircle, Info} from "lucide-react";

// --- Dialog types ---

type DialogType = "confirm" | "prompt" | "alert" | "choose";
type DialogVariant = "default" | "danger" | "success" | "info";

interface ChoiceOption {
    value: string;
    label: string;
    variant?: DialogVariant;
    autoFocus?: boolean;
}

interface DialogOptions {
    title: string;
    message: string;
    type: DialogType;
    variant?: DialogVariant;
    confirmLabel?: string;
    cancelLabel?: string;
    placeholder?: string;
    defaultValue?: string;
    choices?: ChoiceOption[];
}

interface DialogState extends DialogOptions {
    resolve: (value: string | boolean | null) => void;
}

// --- Context ---

interface ConfirmLabels {
    confirmLabel?: string;
    cancelLabel?: string;
}

interface DialogContextValue {
    confirm: (title: string, message: string, variant?: DialogVariant, labels?: ConfirmLabels) => Promise<boolean>;
    prompt: (title: string, message: string, placeholder?: string, defaultValue?: string) => Promise<string | null>;
    alert: (title: string, message: string, variant?: DialogVariant) => Promise<void>;
    choose: (title: string, message: string, choices: ChoiceOption[], cancelLabel?: string) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
    const ctx = useContext(DialogContext);
    if (!ctx) throw new Error("useDialog must be used within DialogProvider");
    return ctx;
}

// --- Provider ---

export function DialogProvider({children}: {children: React.ReactNode}) {
    const {t} = useI18n();
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [inputValue, setInputValue] = useState("");
    // #33 from the Settings-Completeness audit close: power-user
    // mode that skips non-destructive confirmation dialogs. Reads
    // ``behavior.skip_non_destructive_confirmations`` from
    // app.yaml on mount; defaults to false (every confirm renders
    // normally, the existing behaviour). Destructive dialogs
    // (variant === "danger") ALWAYS render regardless of this flag.
    const [skipNonDestructive, setSkipNonDestructive] = useState(false);
    useEffect(() => {
        let cancelled = false;
        api.settings
            .getApp()
            .then((config) => {
                if (cancelled) return;
                const behavior =
                    (config.behavior as Record<string, unknown> | undefined) ??
                    {};
                if (behavior.skip_non_destructive_confirmations === true) {
                    setSkipNonDestructive(true);
                }
            })
            .catch(() => {
                // Keep default false when settings unreachable.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const showDialog = useCallback((options: DialogOptions): Promise<string | boolean | null> => {
        return new Promise((resolve) => {
            setDialog({...options, resolve});
            setInputValue(options.defaultValue || "");
        });
    }, []);

    const confirm = useCallback((title: string, message: string, variant?: DialogVariant, labels?: ConfirmLabels) => {
        // Auto-confirm path: power-user mode + the call is not
        // marked destructive. ``variant === "danger"`` is the
        // load-bearing signal; absence means safe-to-skip.
        // ``prompt`` + ``choose`` + ``alert`` never reach this
        // branch (separate exported APIs).
        if (skipNonDestructive && variant !== "danger") {
            return Promise.resolve(true);
        }
        return showDialog({title, message, type: "confirm", variant, ...labels}) as Promise<boolean>;
    }, [showDialog, skipNonDestructive]);

    const prompt = useCallback((title: string, message: string, placeholder?: string, defaultValue?: string) => {
        return showDialog({title, message, type: "prompt", placeholder, defaultValue}) as Promise<string | null>;
    }, [showDialog]);

    const alert = useCallback((title: string, message: string, variant?: DialogVariant) => {
        return showDialog({title, message, type: "alert", variant}).then(() => {});
    }, [showDialog]);

    const choose = useCallback((title: string, message: string, choices: ChoiceOption[], cancelLabel?: string) => {
        return showDialog({title, message, type: "choose", choices, cancelLabel}) as Promise<string | null>;
    }, [showDialog]);

    const handleConfirm = () => {
        if (!dialog) return;
        if (dialog.type === "prompt") {
            dialog.resolve(inputValue.trim() || null);
        } else {
            dialog.resolve(true);
        }
        setDialog(null);
    };

    const handleCancel = () => {
        if (!dialog) return;
        if (dialog.type === "prompt" || dialog.type === "choose") {
            dialog.resolve(null);
        } else if (dialog.type === "confirm") {
            dialog.resolve(false);
        } else {
            dialog.resolve(true);
        }
        setDialog(null);
    };

    const handleChoose = (value: string) => {
        if (!dialog) return;
        dialog.resolve(value);
        setDialog(null);
    };

    const variant = dialog?.variant || "default";
    const icon = variant === "danger" ? <AlertTriangle size={22} style={{color: "var(--danger)"}}/>
        : variant === "success" ? <CheckCircle size={22} style={{color: "var(--success, #16a34a)"}}/>
        : variant === "info" ? <Info size={22} style={{color: "var(--accent)"}}/>
        : null;

    const btnClass = (v?: DialogVariant) =>
        `btn ${v === "danger" ? "btn-danger" : v === "success" ? "btn-primary" : "btn-secondary"}`;

    return (
        <DialogContext.Provider value={{confirm, prompt, alert, choose}}>
            {children}
            <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
                {dialog && (
                    <DialogContent size="default" onEscapeKeyDown={handleCancel}>
                        <DialogHeader>
                            <div style={{display: "flex", alignItems: "center", gap: 10}}>
                                {icon}
                                <DialogTitle>{dialog.title}</DialogTitle>
                            </div>
                            <DialogClose asChild>
                                <button className="btn-icon" onClick={handleCancel} aria-label="Close">
                                    <X size={16}/>
                                </button>
                            </DialogClose>
                        </DialogHeader>

                        <DialogDescription>
                            {dialog.message}
                        </DialogDescription>

                        {dialog.type === "prompt" && (
                            <input
                                className="input"
                                style={{marginTop: 12}}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && inputValue.trim() && handleConfirm()}
                                placeholder={dialog.placeholder || ""}
                                autoFocus
                            />
                        )}

                        <DialogFooter>
                            {dialog.type === "choose" ? (
                                <>
                                    <button
                                        className="btn btn-ghost"
                                        data-testid="app-dialog-cancel"
                                        onClick={handleCancel}
                                    >
                                        {dialog.cancelLabel || t("ui.common.cancel", "Abbrechen")}
                                    </button>
                                    {(dialog.choices || []).map((choice) => (
                                        <button
                                            key={choice.value}
                                            className={btnClass(choice.variant)}
                                            data-testid={`app-dialog-choice-${choice.value}`}
                                            onClick={() => handleChoose(choice.value)}
                                            autoFocus={choice.autoFocus}
                                        >
                                            {choice.label}
                                        </button>
                                    ))}
                                </>
                            ) : (
                                <>
                                    {dialog.type !== "alert" && (
                                        <button
                                            className="btn btn-ghost"
                                            data-testid="app-dialog-cancel"
                                            onClick={handleCancel}
                                        >
                                            {dialog.cancelLabel || t("ui.common.cancel", "Abbrechen")}
                                        </button>
                                    )}
                                    <button
                                        className={`btn ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
                                        data-testid="app-dialog-confirm"
                                        onClick={handleConfirm}
                                        disabled={dialog.type === "prompt" && !inputValue.trim()}
                                        autoFocus={dialog.type !== "prompt"}
                                    >
                                        {dialog.confirmLabel || (dialog.type === "alert" ? "OK" : t("ui.common.confirm", "Bestätigen"))}
                                    </button>
                                </>
                            )}
                        </DialogFooter>
                    </DialogContent>
                )}
            </Dialog>
        </DialogContext.Provider>
    );
}
