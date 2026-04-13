import {useState, useCallback, createContext, useContext} from "react";
import {useI18n} from "../hooks/useI18n";
import * as Dialog from "@radix-ui/react-dialog";
import {X, AlertTriangle, CheckCircle, Info} from "lucide-react";

// --- Dialog types ---

type DialogType = "confirm" | "prompt" | "alert";
type DialogVariant = "default" | "danger" | "success" | "info";

interface DialogOptions {
    title: string;
    message: string;
    type: DialogType;
    variant?: DialogVariant;
    confirmLabel?: string;
    cancelLabel?: string;
    placeholder?: string;
    defaultValue?: string;
}

interface DialogState extends DialogOptions {
    resolve: (value: string | boolean | null) => void;
}

// --- Context ---

interface DialogContextValue {
    confirm: (title: string, message: string, variant?: DialogVariant) => Promise<boolean>;
    prompt: (title: string, message: string, placeholder?: string, defaultValue?: string) => Promise<string | null>;
    alert: (title: string, message: string, variant?: DialogVariant) => Promise<void>;
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

    const showDialog = useCallback((options: DialogOptions): Promise<string | boolean | null> => {
        return new Promise((resolve) => {
            setDialog({...options, resolve});
            setInputValue(options.defaultValue || "");
        });
    }, []);

    const confirm = useCallback((title: string, message: string, variant?: DialogVariant) => {
        return showDialog({title, message, type: "confirm", variant}) as Promise<boolean>;
    }, [showDialog]);

    const prompt = useCallback((title: string, message: string, placeholder?: string, defaultValue?: string) => {
        return showDialog({title, message, type: "prompt", placeholder, defaultValue}) as Promise<string | null>;
    }, [showDialog]);

    const alert = useCallback((title: string, message: string, variant?: DialogVariant) => {
        return showDialog({title, message, type: "alert", variant}).then(() => {});
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
        if (dialog.type === "prompt") {
            dialog.resolve(null);
        } else if (dialog.type === "confirm") {
            dialog.resolve(false);
        } else {
            dialog.resolve(true);
        }
        setDialog(null);
    };

    const variant = dialog?.variant || "default";
    const icon = variant === "danger" ? <AlertTriangle size={22} style={{color: "var(--danger)"}}/>
        : variant === "success" ? <CheckCircle size={22} style={{color: "#16a34a"}}/>
        : variant === "info" ? <Info size={22} style={{color: "var(--accent)"}}/>
        : null;

    return (
        <DialogContext.Provider value={{confirm, prompt, alert}}>
            {children}
            <Dialog.Root open={!!dialog} onOpenChange={(open) => { if (!open) handleCancel(); }}>
                <Dialog.Portal>
                    <Dialog.Overlay className="dialog-overlay"/>
                    <Dialog.Content className="dialog-content" onEscapeKeyDown={handleCancel}>
                        {dialog && (
                            <>
                                <div className="dialog-header">
                                    <div style={{display: "flex", alignItems: "center", gap: 10}}>
                                        {icon}
                                        <Dialog.Title className="dialog-title">{dialog.title}</Dialog.Title>
                                    </div>
                                    <Dialog.Close asChild>
                                        <button className="btn-icon" onClick={handleCancel} aria-label="Close">
                                            <X size={16}/>
                                        </button>
                                    </Dialog.Close>
                                </div>

                                <Dialog.Description className="dialog-message">
                                    {dialog.message}
                                </Dialog.Description>

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

                                <div className="dialog-footer">
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
                                </div>
                            </>
                        )}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
        </DialogContext.Provider>
    );
}
