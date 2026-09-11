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
import {ApiError} from '../../api/client'
import {backendReachability} from '../../api/backendReachability'

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

/** Raise the error toast unconditionally. Separate from ``notify.error`` so
 *  the withheld-toast flush below can release a toast whose suppression
 *  checks have already been answered. */
function raiseErrorToast(message: string, err?: ApiError) {
  recordToast('error', message)
  return toast.error(React.createElement(ErrorContent, {message, apiError: err}), {
    autoClose: 15000,
    closeOnClick: false,
  })
}

/** Toasts withheld while a failure awaits its confirmation probe (#770).
 *
 *  A single network failure is not proof of an outage, so the toast cannot
 *  be dropped on the spot - a request-specific failure (one oversized
 *  upload reset, one stalled export) must still reach the user. It is
 *  parked here until the probe decides: released when the backend turns
 *  out healthy, discarded when the outage is confirmed and the persistent
 *  banner takes over.
 */
type WithheldToast =
  | {kind: 'error'; message: string; err?: ApiError}
  | {kind: 'saveError'; message: string; onRetry: () => void; retryLabel: string}

const withheld: WithheldToast[] = []

backendReachability.subscribeSuspicion((confirmedDown) => {
  const parked = withheld.splice(0, withheld.length)
  if (confirmedDown) {
    // The banner is up and states the cause; replaying these would be the
    // per-call noise #765 removed.
    return
  }
  for (const entry of parked) {
    if (entry.kind === 'error') {
      raiseErrorToast(entry.message, entry.err)
    } else {
      raiseSaveErrorToast(entry.message, entry.onRetry, entry.retryLabel)
    }
  }
})

function raiseSaveErrorToast(message: string, onRetry: () => void, retryLabel: string) {
  recordToast('error', message)
  return toast.error(
    React.createElement(SaveErrorContent, {message, onRetry, retryLabel}),
    {autoClose: false, closeOnClick: false, toastId: 'save-error'},
  )
}

function recordToast(level: string, message: string) {
  try {
    // Dynamic import to avoid circular dependencies
    import('../eventRecorder/eventRecorder').then(({eventRecorder}) => {
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
    // Network-level failures (#765): the persistent backend-unreachable
    // banner is the ONE surface. Per-call red toasts during an outage are
    // noise (and each carried a useless TypeError issue report), so they
    // downgrade to console warnings exactly like the offline guard above.
    // The store check also covers the ~22 call sites that pass a message
    // only (no error object) - per-error classification can never reach
    // those, and during an outage every one of them is a network failure.
    if (backendReachability.isDown()) {
      console.warn(`[backend-unreachable] ${message}${err ? ` (${err.endpoint})` : ''}`)
      return
    }
    // The outage is not established yet (#770). The store decides via one
    // immediate /api/health probe, so park the toast rather than drop it:
    // a request-specific failure on a healthy backend still has to be
    // reported. Note the ApiError's own `network` flag is deliberately NOT
    // consulted here - it says the request died at the network level, not
    // that the backend is gone, which is exactly the conflation #770 fixed.
    if (backendReachability.isSuspected()) {
      withheld.push({kind: 'error', message, err})
      console.warn(`[backend-suspect] ${message}${err ? ` (${err.endpoint})` : ''}`)
      return
    }
    return raiseErrorToast(message, err)
  },
  saveError: (message: string, onRetry: () => void, retryLabel: string) => {
    // Autosave fires on a timer, so during an outage this persistent
    // (autoClose:false) toast reappeared on every tick. The banner already
    // states the cause and carries the retry; the editor keeps its own
    // save-status indicator. (#765)
    if (backendReachability.isDown()) {
      console.warn(`[backend-unreachable] ${message}`)
      return
    }
    // Same confirm-before-flip parking as notify.error (#770). The stable
    // toastId means a released save-error still occupies one slot.
    if (backendReachability.isSuspected()) {
      withheld.push({kind: 'saveError', message, onRetry, retryLabel})
      console.warn(`[backend-suspect] ${message}`)
      return
    }
    return raiseSaveErrorToast(message, onRetry, retryLabel)
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
