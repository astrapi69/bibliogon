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

const ISSUES_URL = 'https://github.com/astrapi69/bibliogon/issues/new'
const APP_VERSION = '0.11.0'
const MAX_URL_LENGTH = 4000
// Truncate the visible error message so the toast stays readable.
// The full detail is still embedded in the GitHub issue URL body.
const MAX_DISPLAY_LENGTH = 200

function buildIssueUrl(message: string, apiError?: ApiError): string {
  const title = `Bug: ${message.slice(0, 80)}`

  const sections: string[] = []

  // Error description
  sections.push(`## Fehlerbeschreibung\n${message}`)

  // Context (if ApiError)
  if (apiError) {
    const ctx = [
      `- Seite: ${window.location.pathname}`,
      `- Aktion: ${apiError.method} ${apiError.endpoint}`,
      `- Zeitpunkt: ${apiError.timestamp}`,
    ]
    sections.push(`## Kontext\n${ctx.join('\n')}`)

    // Technical details
    const tech = [
      `- HTTP Status: ${apiError.status}`,
      `- API Endpoint: ${apiError.method} ${apiError.endpoint}`,
    ]
    if (apiError.stacktrace) {
      const st = apiError.stacktrace.slice(0, 800)
      tech.push(`- Backend Stacktrace:\n\`\`\`\n${st}\n\`\`\``)
    }
    sections.push(`## Technische Details\n${tech.join('\n')}`)
  }

  // Environment
  const env = [
    `- App Version: ${APP_VERSION}`,
    `- Browser: ${navigator.userAgent.split(' ').slice(-3).join(' ')}`,
    `- OS: ${navigator.platform}`,
    `- Route: ${window.location.pathname}`,
  ]
  sections.push(`## Umgebung\n${env.join('\n')}`)

  // Reproduction steps
  if (apiError) {
    sections.push(
      `## Reproduktion\n` +
      `1. Seite "${window.location.pathname}" geoeffnet\n` +
      `2. Aktion "${apiError.method} ${apiError.endpoint}" ausgefuehrt\n` +
      `3. Fehler "${message.slice(0, 100)}" erhalten`
    )
  } else {
    sections.push(`## Reproduktion\n1.\n2.\n3.`)
  }

  const body = sections.join('\n\n')

  // Truncate if too long for URL
  const encodedBody = encodeURIComponent(body.slice(0, MAX_URL_LENGTH))
  const encodedTitle = encodeURIComponent(title)
  return `${ISSUES_URL}?title=${encodedTitle}&body=${encodedBody}&labels=bug`
}

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
      'a',
      {
        href: buildIssueUrl(message, apiError),
        target: '_blank',
        rel: 'noopener noreferrer',
        onClick: (e: React.MouseEvent) => e.stopPropagation(),
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
          // Ensure the button is always clickable even when the toast
          // auto-closes — stopPropagation above prevents closeOnClick
          // from swallowing the click.
        },
      },
      'Issue melden',
    ),
  )
}

export const notify = {
  error: (message: string, apiError?: unknown) => {
    const err = apiError instanceof ApiError ? apiError : undefined
    return toast.error(React.createElement(ErrorContent, {message, apiError: err}), {
      autoClose: 15000,
      // Disable closeOnClick so clicking the "Issue melden" link does
      // not dismiss the toast before the browser opens the new tab.
      closeOnClick: false,
    })
  },
  warning: (message: string) => toast.warning(message, {autoClose: 12000}),
  info: (message: string) => toast.info(message, {autoClose: 10000}),
  success: (message: string) => toast.success(message, {autoClose: 5000}),
}
