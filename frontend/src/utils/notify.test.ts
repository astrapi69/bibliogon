/**
 * Tests for the toast notification utility.
 *
 * Regression: error toasts with long messages (SQL queries, stacktraces)
 * overflow the toast container. The "Issue melden" link must be clickable
 * and closeOnClick must be disabled so the click reaches the link.
 */

import {describe, it, expect, vi, beforeEach} from 'vitest'

vi.mock('react-toastify', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}))

import {toast} from 'react-toastify'
import {ApiError} from '../api/client'
import {notify} from './notify'

beforeEach(() => {
  vi.mocked(toast.error).mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.info).mockReset()
})

describe('notify.error', () => {
  it('calls toast.error with autoClose 15000 and closeOnClick false', () => {
    notify.error('Something broke')
    expect(toast.error).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(toast.error).mock.calls[0][1] as Record<string, unknown>
    expect(opts.autoClose).toBe(15000)
    // closeOnClick must be false so the "Issue melden" link is clickable
    expect(opts.closeOnClick).toBe(false)
  })

  it('renders a React element as first argument (not a plain string)', () => {
    notify.error('Test error')
    const content = vi.mocked(toast.error).mock.calls[0][0]
    // React.createElement returns an object with type/props/key
    expect(typeof content).toBe('object')
    expect(content).not.toBeNull()
  })

  it('accepts an ApiError as second argument without crashing', () => {
    const apiErr = new ApiError(500, 'DB exploded', '/api/books', 'GET', 'Traceback...')
    expect(() => notify.error('Import failed', apiErr)).not.toThrow()
    expect(toast.error).toHaveBeenCalledTimes(1)
  })

  it('accepts a non-ApiError as second argument without crashing', () => {
    expect(() => notify.error('oops', new Error('plain'))).not.toThrow()
    expect(() => notify.error('oops', 'string error')).not.toThrow()
    expect(() => notify.error('oops', undefined)).not.toThrow()
  })
})

describe('notify (other levels)', () => {
  it('success uses 5s autoClose', () => {
    notify.success('done')
    expect(toast.success).toHaveBeenCalledWith('done', {autoClose: 5000})
  })

  it('info uses 10s autoClose', () => {
    notify.info('fyi')
    expect(toast.info).toHaveBeenCalledWith('fyi', {autoClose: 10000})
  })
})
