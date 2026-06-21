import {useCallback} from "react";
import {useLocation, useNavigate} from "react-router-dom";

/**
 * Back-navigation for full-page surfaces (the Dialog->Pages migration).
 *
 * Uses the established convention (see the Bug-1 back-button fix +
 * `pages/back-button-navigation.test.tsx`): when the page was reached
 * by a direct URL / deep link there is no in-app history to pop, so we
 * navigate to a sensible `fallback`; otherwise we pop the history
 * stack so Back returns to wherever the user came from.
 *
 * `location.key === "default"` is React Router's signal that this is
 * the first entry in the session (no prior in-app navigation).
 */
export function useGoBack(fallback = "/"): () => void {
    const navigate = useNavigate();
    const location = useLocation();
    return useCallback(() => {
        if (location.key === "default") {
            navigate(fallback);
        } else {
            navigate(-1);
        }
    }, [navigate, location.key, fallback]);
}
