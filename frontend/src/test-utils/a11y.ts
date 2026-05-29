import {expect} from "vitest"
import {axe} from "vitest-axe"

/** Axe impact levels considered build-breaking. */
const SEVERE_IMPACTS = new Set(["critical", "serious"])

/**
 * Run axe-core against a rendered container and assert zero
 * critical/serious accessibility violations. Catches the
 * build-breaking a11y regressions (missing labels, button/link
 * names, alt text, invalid aria) at build time (Vitest +
 * happy-dom) with no running app needed.
 *
 * By default only ``critical`` + ``serious`` impacts fail the
 * assertion (pass ``{severeOnly: false}`` to assert on ALL
 * impacts). The moderate/minor "best-practice" rules — e.g.
 * ``landmark-unique`` / ``region`` — fire spuriously when a single
 * editor component is rendered in isolation (no surrounding page
 * landmarks), so they are out of scope here.
 *
 * Note: happy-dom is not a full browser, so this covers the
 * static, markup-level axe rules. The dynamic, layout/contrast-
 * dependent checks still belong in a live axe run against the dev
 * server (the Phase A audit's Aster-run §8c step); this helper is
 * the automated complement, not a replacement.
 */
export async function expectNoA11yViolations(
    container: HTMLElement,
    {severeOnly = true}: {severeOnly?: boolean} = {},
): Promise<void> {
    const results = await axe(container)
    const violations = severeOnly
        ? results.violations.filter(
              (v) => v.impact != null && SEVERE_IMPACTS.has(v.impact),
          )
        : results.violations
    expect(violations).toEqual([])
}
