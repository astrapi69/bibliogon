/**
 * Centralized toast notification wrapper with type-specific display durations.
 *
 * Duration per type:
 * - error:   15s (user needs time to read and understand)
 * - warning: 12s
 * - info:    10s
 * - success:  5s (brief confirmation)
 *
 * Error toasts include a "Report Issue" button that opens GitHub Issues
 * with pre-filled title and body.
 */

import React from 'react'
import {toast} from 'react-toastify'

const ISSUES_URL = 'https://github.com/astrapi69/bibliogon/issues/new'
const APP_VERSION = '0.10.0'

function buildIssueUrl(message: string): string {
  const title = `Bug: ${message.slice(0, 80)}`
  const body = `**App Version:** ${APP_VERSION}
**Browser:** ${navigator.userAgent.split(' ').slice(-2).join(' ')}

**Error:** ${message}

**Steps to reproduce:**
1.
2.
3.

**Expected behavior:**

**Actual behavior:**
`
  return `${ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=bug`
}

function ErrorContent({message}: {message: string}) {
  return React.createElement('div', {style: {display: 'flex', flexDirection: 'column', gap: 6}},
    React.createElement('span', null, message),
    React.createElement('a', {
      href: buildIssueUrl(message),
      target: '_blank',
      rel: 'noopener noreferrer',
      style: {
        fontSize: '0.75rem',
        color: '#fca5a5',
        textDecoration: 'underline',
        cursor: 'pointer',
        alignSelf: 'flex-start',
      },
    }, 'Issue melden'),
  )
}

export const notify = {
  error: (message: string) =>
    toast.error(React.createElement(ErrorContent, {message}), {autoClose: 15000}),
  warning: (message: string) => toast.warning(message, {autoClose: 12000}),
  info: (message: string) => toast.info(message, {autoClose: 10000}),
  success: (message: string) => toast.success(message, {autoClose: 5000}),
}
