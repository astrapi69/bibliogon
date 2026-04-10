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
    recordToast('error', message)
    const err = apiError instanceof ApiError ? apiError : undefined
    return toast.error(React.createElement(ErrorContent, {message, apiError: err}), {
      autoClose: 15000,
      closeOnClick: false,
    })
  },
  warning: (message: string) => { recordToast('warning', message); return toast.warning(message, {autoClose: 12000}) },
  info: (message: string) => { recordToast('info', message); return toast.info(message, {autoClose: 10000}) },
  success: (message: string) => { recordToast('success', message); return toast.success(message, {autoClose: 5000}) },
}
