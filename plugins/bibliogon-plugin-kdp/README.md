# Bibliogon Plugin: Amazon KDP

Amazon Kindle Direct Publishing plugin for [Bibliogon](https://github.com/astrapi69/bibliogon).

## Features

- KDP-compatible metadata generation (title, author, categories, keywords)
- Cover image validation (dimensions, DPI, aspect ratio, file size, format)
- KDP category browser (25 categories)
- Language mapping to KDP format

## Installation

### Via ZIP

1. Build: `make build-zip`
2. In Bibliogon: Settings > Plugins > "ZIP installieren"
3. Upload `dist/bibliogon-plugin-kdp-v1.0.0.zip`
4. Activate with a valid license key

## License

Proprietary. Requires a valid Bibliogon license key (Premium tier).

## API Endpoints

- `POST /api/kdp/metadata` - Generate KDP-compatible metadata
- `POST /api/kdp/validate-cover` - Validate cover image against KDP specs
- `GET /api/kdp/categories` - List available KDP categories
