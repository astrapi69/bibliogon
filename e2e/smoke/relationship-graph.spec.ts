/**
 * Smoke test for the Story Bible relationship graph
 * (STORY-BIBLE-RELATIONSHIP-GRAPH-01).
 *
 * Covers the live React Flow canvas Vitest mocks away: seed two
 * entities + a relationship via the API, open ?view=relationships, and
 * assert the canvas + an entity node render (with real, non-collapsed
 * dimensions) and a node click opens the detail panel.
 *
 * Testid namespace: relationship-graph / entity-node-* /
 * relationship-detail-* / chapter-sidebar-relationships.
 */
import { test, expect, createBook } from "../fixtures/base"

const API = "http://localhost:8000/api"

test.describe("Relationship graph", () => {
  test("renders entities + edges and opens a node detail panel", async ({ page }) => {
    const book = await createBook("Relationship Graph E2E")

    // Seed two entities; the second references the first via a relationship.
    const target = await (
      await page.request.post(`${API}/story-bible/books/${book.id}/entities`, {
        data: { entity_type: "character", name: "Bob" },
      })
    ).json()
    await page.request.post(`${API}/story-bible/books/${book.id}/entities`, {
      data: {
        entity_type: "character",
        name: "Alice",
        relationships: [{ target_entity_id: target.id, relationship_type: "ally" }],
      },
    })

    await page.goto(`/book/${book.id}?view=relationships`)

    // The canvas renders with real (non-collapsed) size.
    const canvas = page.getByTestId("relationship-graph")
    await expect(canvas).toBeVisible()
    const box = await canvas.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThan(200)

    // At least one entity node renders; clicking it opens the detail panel.
    const node = page.locator('[data-testid^="entity-node-"]').first()
    await expect(node).toBeVisible()
    await node.click()
    await expect(page.getByTestId("relationship-detail-panel")).toBeVisible()
  })
})
