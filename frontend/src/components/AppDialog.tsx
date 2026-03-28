import {useState, useCallback, createContext, useContext} from "react";
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
            {dialog && (
                <div style={styles.overlay} onClick={handleCancel}>
                    <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.header}>
                            <div style={{display: "flex", alignItems: "center", gap: 10}}>
                                {icon}
                                <h3 style={styles.title}>{dialog.title}</h3>
                            </div>
                            <button style={styles.closeBtn} onClick={handleCancel}>
                                <X size={16}/>
                            </button>
                        </div>

                        <p style={styles.message}>{dialog.message}</p>

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

                        <div style={styles.footer}>
                            {dialog.type !== "alert" && (
                                <button className="btn btn-ghost" onClick={handleCancel}>
                                    {dialog.cancelLabel || "Abbrechen"}
                                </button>
                            )}
                            <button
                                className={`btn ${variant === "danger" ? "btn-danger" : "btn-primary"}`}
                                onClick={handleConfirm}
                                disabled={dialog.type === "prompt" && !inputValue.trim()}
                                autoFocus={dialog.type !== "prompt"}
                            >
                                {dialog.confirmLabel || (dialog.type === "alert" ? "OK" : "Bestaetigen")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DialogContext.Provider>
    );
}

const styles: Record<string, React.CSSProperties> = {
    overlay: {
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 2000, backdropFilter: "blur(2px)",
    },
    modal: {
        background: "var(--bg-card)", borderRadius: "var(--radius-lg)",
        padding: 24, width: "100%", maxWidth: 440,
        boxShadow: "var(--shadow-lg)",
    },
    header: {
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 12,
    },
    title: {
        fontFamily: "var(--font-display)", fontSize: "1.0625rem", fontWeight: 600,
    },
    closeBtn: {
        background: "none", border: "none", cursor: "pointer",
        color: "var(--text-muted)", padding: 4, borderRadius: 4,
        display: "flex", alignItems: "center",
    },
    message: {
        color: "var(--text-secondary)", fontSize: "0.9375rem", lineHeight: 1.5,
    },
    footer: {
        display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20,
    },
};
