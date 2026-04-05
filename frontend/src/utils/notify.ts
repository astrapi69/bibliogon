/**
 * Centralized toast notification wrapper with type-specific display durations.
 *
 * Error toasts include a "Report Issue" link that opens GitHub Issues
 * with rich debug context (endpoint, status, stacktrace, environment).
 */

import React from 'react'
import {toast} from 'react-toastify'
import {ApiError} from '../api/client'

const ISSUES_URL = 'https://github.com/astrapi69/bibliogon/issues/new'
const APP_VERSION = '0.10.0'
const MAX_URL_LENGTH = 4000

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

function ErrorContent({message, apiError}: {message: string; apiError?: ApiError}) {
  return React.createElement('div', {style: {display: 'flex', flexDirection: 'column', gap: 6}},
    React.createElement('span', null, message),
    React.createElement('a', {
      href: buildIssueUrl(message, apiError),
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
  error: (message: string, apiError?: unknown) => {
    const err = apiError instanceof ApiError ? apiError : undefined
    return toast.error(React.createElement(ErrorContent, {message, apiError: err}), {autoClose: 15000})
  },
  warning: (message: string) => toast.warning(message, {autoClose: 12000}),
  info: (message: string) => toast.info(message, {autoClose: 10000}),
  success: (message: string) => toast.success(message, {autoClose: 5000}),
}
