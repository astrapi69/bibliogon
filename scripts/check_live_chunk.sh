#!/usr/bin/env bash
#
# TC-064 (partial) — post-deploy live-bundle freshness check.
#
# Fetches a deployed site's app shell + its referenced JS chunks and
# confirms an expected string literal of the CURRENT release is present in
# the shipped bundle. A stale CDN / service-worker bundle is caught here
# (the curl-on-live-chunk technique from the stale-service-worker-root-cause
# memory). The full browser SW-unregister + clear-site-data + hard-reload
# path stays manual; this automates the "is the live bundle fresh?" slice.
#
# Usage:
#   scripts/check_live_chunk.sh <LIVE_URL> <EXPECTED_MARKER>
#
# Example (run after a GitHub-Pages deploy):
#   scripts/check_live_chunk.sh \
#     https://astrapi69.github.io/bibliogon/ "0.52.0"
#
# Exits non-zero if the marker is absent from the app shell AND every
# referenced .js chunk.
set -euo pipefail

LIVE_URL="${1:-${LIVE_URL:-}}"
EXPECTED_MARKER="${2:-${EXPECTED_MARKER:-}}"

if [[ -z "${LIVE_URL}" || -z "${EXPECTED_MARKER}" ]]; then
    echo "usage: $0 <LIVE_URL> <EXPECTED_MARKER>" >&2
    echo "   or: LIVE_URL=... EXPECTED_MARKER=... $0" >&2
    exit 2
fi

# Normalise to a trailing slash so relative chunk paths resolve, and derive
# the scheme://host origin for root-absolute chunk paths.
case "${LIVE_URL}" in
    */) base="${LIVE_URL}" ;;
    *) base="${LIVE_URL}/" ;;
esac
origin="$(sed -E 's#^(https?://[^/]+).*#\1#' <<<"${LIVE_URL}")"

echo "Checking live bundle freshness at ${LIVE_URL}"
echo "Expecting marker: ${EXPECTED_MARKER}"

html="$(curl -fsSL "${LIVE_URL}")"

if grep -qF -- "${EXPECTED_MARKER}" <<<"${html}"; then
    echo "OK: marker present in the app shell HTML."
    exit 0
fi

# Extract referenced .js chunk paths from src=/href= attributes.
mapfile -t chunks < <(grep -oE '(src|href)="[^"]+\.js"' <<<"${html}" \
    | sed -E 's/^(src|href)="//; s/"$//' | sort -u)

if [[ "${#chunks[@]}" -eq 0 ]]; then
    echo "FAIL: no .js chunks referenced in ${LIVE_URL}" >&2
    exit 1
fi

for path in "${chunks[@]}"; do
    case "${path}" in
        http*) url="${path}" ;;
        /*) url="${origin}${path}" ;;
        *) url="${base}${path}" ;;
    esac
    if curl -fsSL "${url}" | grep -qF -- "${EXPECTED_MARKER}"; then
        echo "OK: marker present in ${url}"
        exit 0
    fi
done

echo "FAIL: marker '${EXPECTED_MARKER}' not found in the app shell or any" \
    "of the ${#chunks[@]} referenced chunks — possible stale SW/CDN bundle." >&2
exit 1
