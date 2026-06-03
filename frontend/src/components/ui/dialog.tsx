import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import {cn} from "@/lib/utils";

/*
 * shadcn-structured Dialog primitive, styled LIKE-FOR-LIKE to reproduce
 * the existing global `.dialog-*` / `.radix-dialog-*` surfaces exactly
 * (Phase B C1). Geometry is ported to token-mapped Tailwind utilities so
 * the global classes can be retired in C9; animations point at the
 * existing `@keyframes fadeIn` / `slideIn` in global.css, so no
 * animation dependency is introduced.
 *
 * Intentionally does NOT auto-inject a close button (unlike upstream
 * shadcn): the existing consumers compose their own header + close, and
 * adding one would be a visual change. DialogDescription is first-class
 * (the built-in fix for the recurring missing-aria-description bug).
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({className, ...props}, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn(
            "fixed inset-0 z-[2000] bg-black/50 backdrop-blur-[2px] animate-[fadeIn_150ms_ease]",
            className,
        )}
        {...props}
    />
));
DialogOverlay.displayName = "DialogOverlay";

export type DialogSize = "default" | "wide" | "large" | "none";

const DIALOG_SIZE: Record<DialogSize, string> = {
    // .dialog-content
    default: "w-full max-w-[440px]",
    // .dialog-content-wide (scrollable)
    wide: "w-full max-w-[560px] max-h-[90vh] overflow-y-auto",
    // .radix-dialog-content (the raw-Radix wide modals)
    large: "w-[min(720px,95vw)] max-h-[90vh] overflow-y-auto",
    // No width/height: the consumer owns sizing via its own className
    // (e.g. a CSS-module .content). Avoids a max-w utility clipping a
    // consumer-set width during migration.
    none: "",
};

export interface DialogContentProps
    extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    size?: DialogSize;
    /** Skip the portal+overlay wrapper (when a consumer renders its own). */
    bare?: boolean;
}

export const DialogContent = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Content>,
    DialogContentProps
>(({className, size = "default", bare = false, children, ...props}, ref) => {
    const content = (
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                "fixed left-1/2 top-1/2 z-[2001] -translate-x-1/2 -translate-y-1/2 bg-card rounded-[var(--radius-lg)] p-6 shadow-[var(--shadow-lg)] animate-[slideIn_150ms_ease]",
                DIALOG_SIZE[size],
                className,
            )}
            {...props}
        >
            {children}
        </DialogPrimitive.Content>
    );
    if (bare) return content;
    return (
        <DialogPortal>
            <DialogOverlay />
            {content}
        </DialogPortal>
    );
});
DialogContent.displayName = "DialogContent";

export function DialogHeader({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("flex items-center justify-between mb-3", className)} {...props} />;
}

export function DialogFooter({className, ...props}: React.HTMLAttributes<HTMLDivElement>) {
    return <div className={cn("flex justify-end gap-2 mt-5", className)} {...props} />;
}

export const DialogTitle = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({className, ...props}, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn(
            "font-[family-name:var(--font-display)] text-[1.0625rem] font-semibold",
            className,
        )}
        {...props}
    />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
    React.ElementRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({className, ...props}, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn(
            "text-[var(--text-secondary)] text-[0.9375rem] leading-normal whitespace-pre-line",
            className,
        )}
        {...props}
    />
));
DialogDescription.displayName = "DialogDescription";
