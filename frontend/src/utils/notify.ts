/**
 * Centralized toast notification wrapper with type-specific display durations.
 *
 * Duration per type:
 * - error:   15s (user needs time to read and understand)
 * - warning: 12s
 * - info:    10s
 * - success:  5s (brief confirmation)
 *
 * All toasts keep the manual close button (X).
 */

import {toast} from 'react-toastify'

export const notify = {
  error: (message: string) => toast.error(message, {autoClose: 15000}),
  warning: (message: string) => toast.warning(message, {autoClose: 12000}),
  info: (message: string) => toast.info(message, {autoClose: 10000}),
  success: (message: string) => toast.success(message, {autoClose: 5000}),
}
