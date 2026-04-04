# Bibliogon Plugin: Kinderbuch

Children's book layout plugin for [Bibliogon](https://github.com/astrapi69/bibliogon).

## Features

- 4 page layout templates: Picture Top, Picture Left, Full-Page Image, Text Only
- Kinderbuch-specific CSS for EPUB/PDF export
- HTML preview for each layout
- Configurable: font size, image dimensions, page background

## Installation

### Via ZIP (recommended)

1. Build: `make build-zip`
2. In Bibliogon: Settings > Plugins > "ZIP installieren"
3. Upload `dist/bibliogon-plugin-kinderbuch-v1.0.0.zip`
4. Activate with a valid license key

### Via Poetry (development)

```bash
cd plugins/bibliogon-plugin-kinderbuch
poetry install
```

## License

Proprietary. Requires a valid Bibliogon license key (Premium tier).

## API Endpoints

- `GET /api/kinderbuch/templates` - List available layout templates
- `POST /api/kinderbuch/preview` - Generate HTML preview for a page

## Templates

| ID | Layout | Description |
|----|--------|-------------|
| picture-top | image-top-text-bottom | 70% image top, 30% text bottom |
| picture-left | image-left-text-right | 50/50 image left, text right |
| picture-full | image-full-text-overlay | Full-page image with text overlay |
| text-only | text-only | Text content only |
