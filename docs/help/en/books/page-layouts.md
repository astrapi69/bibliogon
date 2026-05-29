# Picture-book page layouts

Every picture-book page picks a **layout** — how its image(s) and text are arranged on the page. The layout is chosen from a categorised picker in the page editor; switching a page's layout preserves each layout's own settings (see [Text configuration](text-configuration.md) for the per-layout Tier properties).

There are 13 layouts in 5 categories.

## Image with text

The single-image layouts pair one image with a text region:

- **Image top, text bottom** — image fills the top, text sits below.
- **Image bottom, text top** — the vertical mirror.
- **Image left, text right** — side-by-side with an adjustable split ratio.
- **Image right, text left** — the horizontal mirror.
- **Full image with text overlay** — text floats on top of a full-bleed image, with text-position, backdrop-opacity, and container width/height controls.
- **Image as border with centered text** — the image frames the page; text is centered inside.

## Image only

- **Full image (no text)** — a full-bleed image with no text region. Use it for wordless spreads.

## Multiple images

- **Two images with centered text** — two images with a centered text band between them.
- **Split horizontal** — two images side by side.
- **Split vertical** — two images stacked.
- **Collage** — see below.

## Text only

- **Text only** — a text page with no image (e.g. a dedication or a title spread).

## Special

- **Speech bubble** — an image with one or more positioned speech bubbles (anchor grid + opacity + size), shared with the comic-book bubble model.

## Collage

The **collage** layout is free-form: you place any number of image and text regions anywhere on the page and size them independently.

- **Add a region** from the editor toolbar, then **drag it** to position and **drag its edge** to resize. Each region remembers its position and size.
- **Z-index ordering** controls which region sits on top when two overlap — bring a region forward or send it back.
- Region geometry is stored per-page; the WeasyPrint PDF walker mirrors the editor layout, so the exported PDF matches what you arranged on the canvas.

Collage is the most flexible layout — use it for scrapbook-style spreads, annotated illustrations, or any page where the structured layouts above don't fit.

## Switching layouts

Changing a page's layout never loses another layout's configuration: each layout's settings live in their own namespace inside the page's `layout_config`. Switch from image-top to collage and back, and the image-top settings are exactly as you left them. When you switch between a rich-text (TipTap) layout and a property-based layout, the text content is converted to the right shape automatically.

## Related

- [Text configuration](text-configuration.md) — Tier 1 (Visual Style) + Tier 2 (Typography) properties per layout
- [Storyboard View](storyboard.md) — drag-reorder grid overview of all pages
- [Export](../export/pdf.md) — how layouts render in the exported PDF
