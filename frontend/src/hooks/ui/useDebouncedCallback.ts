import {useCallback, useEffect, useRef} from "react"

/**
 * useDebouncedCallback — wraps a callback so consecutive calls
 * within `delay` ms collapse into one trailing call.
 *
 * PB-PHASE4 Session 4c Commit 3: used by per-layout config
 * controls in PageEditor's properties pane. Discrete controls
 * (radio, dropdown) call the underlying handler directly; slider
 * + similar continuous inputs go through this hook so the API
 * isn't hammered on every onChange tick. Trailing-edge semantics
 * (no leading-edge fire) keep "user picks a value and stops" the
 * natural shape.
 *
 * The latest `fn` reference is captured via a ref so callers can
 * pass an inline arrow function without triggering useEffect
 * cascades that reset the timer on every parent re-render.
 */
export function useDebouncedCallback<Args extends readonly unknown[]>(
    fn: (...args: Args) => void,
    delay: number,
): (...args: Args) => void {
    const fnRef = useRef(fn)
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        fnRef.current = fn
    }, [fn])

    useEffect(
        () => () => {
            if (timer.current) {
                clearTimeout(timer.current)
                timer.current = null
            }
        },
        [],
    )

    return useCallback(
        (...args: Args) => {
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => {
                timer.current = null
                fnRef.current(...args)
            }, delay)
        },
        [delay],
    )
}
