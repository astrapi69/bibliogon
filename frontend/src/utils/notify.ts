/**
 * Centralized toast notification wrapper with type-specific display durations.
 *
 * Error toasts include a "Report Issue" link that opens GitHub Issues
 * with rich debug context (endpoint, status, stacktrace, environment).
 *
 * Layout contract: the ErrorContent component renders inside
 * react-toastify's fixed-width toast container. All text MUST wrap
 * via overflow-wrap/word-break so long SQL errors or stacktraces do
 * not blow out the container width. The "Issue melden" button must
 * be clearly visible and clickable on every screen size.
 */

import React from 'react'
import {toast} from 'react-toastify'
import {ApiError} from '../api/client'

// Truncate the visible error message so the toast stays readable.
// The full detail is still embedded in the ErrorReportDialog body.
const MAX_DISPLAY_LENGTH = 200

/** Truncate a message for display while preserving the beginning (most
 *  useful part). Appended "..." signals that the full text lives in the
 *  GitHub issue body.
 */
function truncateForDisplay(message: string): string {
  if (message.length <= MAX_DISPLAY_LENGTH) return message
  return message.slice(0, MAX_DISPLAY_LENGTH) + '...'
}

function ErrorContent({message, apiError}: {message: string; apiError?: ApiError}) {
  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        // CRITICAL: prevent long SQL errors / stacktraces from blowing
        // out the toast container horizontally.
        maxWidth: '100%',
        overflow: 'hidden',
        overflowWrap: 'break-word',
        wordBreak: 'break-word',
      },
    },
    React.createElement(
      'span',
      {
        style: {
          display: 'block',
          fontSize: '0.8125rem',
          lineHeight: 1.4,
        },
      },
      truncateForDisplay(message),
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation()
          // Dispatch a custom event that ErrorReportDialog listens for
          window.dispatchEvent(new CustomEvent('bibliogon:open-error-report', {
            detail: {message, apiError},
          }))
        },
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#fff',
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 4,
          textDecoration: 'none',
          cursor: 'pointer',
          alignSelf: 'flex-start',
        },
      },
      'Issue melden',
    ),
  )
}

/** Content for save-failed toasts with a Retry action button. */
function SaveErrorContent(
  {message, onRetry, retryLabel, closeToast}: {
    message: string;
    onRetry: () => void;
    retryLabel: string;
    closeToast?: () => void;
  },
) {
  return React.createElement(
    'div',
    {style: {display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word'}},
    React.createElement('span', {style: {display: 'block', fontSize: '0.8125rem', lineHeight: 1.4}}, message),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'save-error-retry',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onRetry();
          closeToast?.();
        },
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          color: '#fff', background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start',
        },
      },
      retryLabel,
    ),
  );
}

/** Content for bulk-action toasts with an Undo action button.
 *  Mirrors SaveErrorContent's shape but uses the success/info
 *  toast styling, since bulk-actions succeed by default — the
 *  Undo is for "oops, I didn't mean that batch" recovery, not
 *  for error retry. */
function BulkActionContent(
  {message, onUndo, undoLabel, closeToast}: {
    message: string;
    onUndo: () => void;
    undoLabel: string;
    closeToast?: () => void;
  },
) {
  return React.createElement(
    'div',
    {style: {display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word'}},
    React.createElement('span', {style: {display: 'block', fontSize: '0.8125rem', lineHeight: 1.4}}, message),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': 'bulk-action-undo',
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onUndo();
          closeToast?.();
        },
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          color: '#fff', background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start',
        },
      },
      undoLabel,
    ),
  );
}

/** Content for success toasts with a forward action button.
 *  Mirrors ``BulkActionContent`` shape but the action semantics
 *  are forward navigation, not undo. testId is parameterised so
 *  the article-to-book "View book" CTA and any future
 *  successAction callsites get distinct E2E hooks. */
function SuccessActionContent(
  {message, actionLabel, onAction, testId, closeToast}: {
    message: string;
    actionLabel: string;
    onAction: () => void;
    testId: string;
    closeToast?: () => void;
  },
) {
  return React.createElement(
    'div',
    {style: {display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '100%', overflowWrap: 'break-word', wordBreak: 'break-word'}},
    React.createElement('span', {style: {display: 'block', fontSize: '0.8125rem', lineHeight: 1.4}}, message),
    React.createElement(
      'button',
      {
        type: 'button',
        'data-testid': testId,
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation();
          onAction();
          closeToast?.();
        },
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600,
          color: '#fff', background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          borderRadius: 4, cursor: 'pointer', alignSelf: 'flex-start',
        },
      },
      actionLabel,
    ),
  );
}

function recordToast(level: string, message: string) {
  try {
    // Dynamic import to avoid circular dependencies
    import('./eventRecorder').then(({eventRecorder}) => {
      eventRecorder.add({type: 'toast', timestamp: performance.now(), level, message})
    }).catch(() => {})
  } catch { /* ignore */ }
}

export const notify = {
  error: (message: string, apiError?: unknown) => {
    const err = apiError instanceof ApiError ? apiError : undefined
    // The backendless-offline guard rejecting an /api call is expected, not a
    // fault: a backend-only surface is simply unavailable offline. Downgrade to
    // a console warning so the user never sees a red toast for it.
    if (err?.offline) {
      console.warn(`[offline] ${message} (${err.endpoint})`)
      return
    }
    recordToast('error', message)
    return toast.error(React.createElement(ErrorContent, {message, apiError: err}), {
      autoClose: 15000,
      closeOnClick: false,
    })
  },
  saveError: (message: string, onRetry: () => void, retryLabel: string) => {
    recordToast('error', message)
    return toast.error(
      React.createElement(SaveErrorContent, {message, onRetry, retryLabel}),
      {autoClose: false, closeOnClick: false, toastId: 'save-error'},
    )
  },
  warning: (message: string) => { recordToast('warning', message); return toast.warning(message, {autoClose: 12000}) },
  info: (message: string) => { recordToast('info', message); return toast.info(message, {autoClose: 10000}) },
  success: (message: string) => { recordToast('success', message); return toast.success(message, {autoClose: 5000}) },
  /** Short, non-intrusive confirmation for auto-saved settings (#472).
   *  A stable toastId means rapid successive saves reuse one toast slot
   *  instead of stacking, and the 2s autoClose keeps it out of the way. */
  saved: (message: string) => { recordToast('success', message); return toast.success(message, {autoClose: 2000, toastId: 'settings-saved'}) },
  /** Success toast with an Undo action button. Used by bulk-delete
   *  (soft path) so the user can recover from "oops, I selected the
   *  wrong filter". Hard-delete does NOT call this — the data is
   *  gone, an Undo button would be a lie. autoClose is longer than
   *  success() because the user needs time to click Undo. */
  bulkAction: (message: string, onUndo: () => void, undoLabel: string) => {
    recordToast('success', message);
    return toast.success(
      React.createElement(BulkActionContent, {message, onUndo, undoLabel}),
      {autoClose: 10000, closeOnClick: false},
    );
  },
  /** Success toast with a generic forward action button. Used by
   *  the article-to-book conversion wizard ("View book"); semantics
   *  differ from ``bulkAction`` (which is undo / cancel). The
   *  testid is parameterised so multiple distinct successAction
   *  callsites do not collide in E2E specs. autoClose 10s gives
   *  the user time to read + click before the toast disappears. */
  successAction: (
    message: string,
    actionLabel: string,
    onAction: () => void,
    testId: string = 'success-action',
  ) => {
    recordToast('success', message);
    return toast.success(
      React.createElement(SuccessActionContent, {
        message,
        actionLabel,
        onAction,
        testId,
      }),
      {autoClose: 10000, closeOnClick: false},
    );
  },
}
