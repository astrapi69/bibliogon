"""KDP cover image validation."""

from pathlib import Path
from typing import Any


class CoverValidationResult:
    """Result of a cover image validation."""

    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []
        self.info: dict[str, Any] = {}

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "valid": self.is_valid,
            "errors": self.errors,
            "warnings": self.warnings,
            "info": self.info,
        }


def validate_cover(
    image_path: str | Path,
    requirements: dict[str, Any],
) -> CoverValidationResult:
    """Validate a cover image against KDP requirements.

    Args:
        image_path: Path to the cover image file.
        requirements: Cover requirement settings from config.

    Returns:
        CoverValidationResult with errors, warnings, and image info.
    """
    result = CoverValidationResult()
    path = Path(image_path)

    # Check file exists
    if not path.exists():
        result.errors.append(f"File not found: {path}")
        return result

    # Check file extension
    allowed = requirements.get("allowed_formats", ["jpg", "jpeg", "tiff", "png"])
    ext = path.suffix.lstrip(".").lower()
    if ext not in allowed:
        result.errors.append(
            f"Unsupported format '{ext}'. Allowed: {', '.join(allowed)}"
        )

    # Check file size
    max_mb = requirements.get("max_file_size_mb", 50)
    file_size_mb = path.stat().st_size / (1024 * 1024)
    result.info["file_size_mb"] = round(file_size_mb, 2)
    if file_size_mb > max_mb:
        result.errors.append(
            f"File size {file_size_mb:.1f} MB exceeds maximum {max_mb} MB"
        )

    # Try to get image dimensions
    try:
        from PIL import Image
        with Image.open(path) as img:
            width, height = img.size
            dpi = img.info.get("dpi", (72, 72))
            actual_dpi = min(dpi) if isinstance(dpi, tuple) else dpi

            result.info["width"] = width
            result.info["height"] = height
            result.info["dpi"] = actual_dpi
            result.info["format"] = img.format

            # Check dimensions
            min_w = requirements.get("min_width", 625)
            min_h = requirements.get("min_height", 1000)
            max_w = requirements.get("max_width", 10000)
            max_h = requirements.get("max_height", 10000)

            if width < min_w or height < min_h:
                result.errors.append(
                    f"Image {width}x{height} is too small. Minimum: {min_w}x{min_h}"
                )
            if width > max_w or height > max_h:
                result.errors.append(
                    f"Image {width}x{height} is too large. Maximum: {max_w}x{max_h}"
                )

            # Check aspect ratio
            if width > 0:
                ratio = height / width
                min_ratio = requirements.get("aspect_ratio_min", 1.5)
                max_ratio = requirements.get("aspect_ratio_max", 1.8)
                result.info["aspect_ratio"] = round(ratio, 2)
                if ratio < min_ratio or ratio > max_ratio:
                    result.warnings.append(
                        f"Aspect ratio {ratio:.2f} is outside recommended range "
                        f"({min_ratio}-{max_ratio})"
                    )

            # Check DPI
            min_dpi = requirements.get("min_dpi", 300)
            if actual_dpi < min_dpi:
                result.warnings.append(
                    f"DPI {actual_dpi} is below recommended minimum {min_dpi}"
                )

    except ImportError:
        result.warnings.append("Pillow not installed, skipping dimension checks")
    except Exception as e:
        result.errors.append(f"Failed to read image: {e}")

    return result


def generate_kdp_metadata(
    book: dict[str, Any],
    categories: list[str] | None = None,
    keywords: list[str] | None = None,
) -> dict[str, Any]:
    """Generate KDP-compatible metadata from book data.

    Returns a dict suitable for KDP upload or display.
    """
    metadata: dict[str, Any] = {
        "title": book.get("title", ""),
        "subtitle": book.get("subtitle", ""),
        "author": book.get("author", ""),
        "description": book.get("description", ""),
        "language": _map_language_to_kdp(book.get("language", "de")),
        "categories": categories or [],
        "keywords": (keywords or [])[:7],  # KDP allows max 7 keywords
        "series": book.get("series"),
        "series_number": book.get("series_index"),
    }
    return metadata


def _map_language_to_kdp(lang: str) -> str:
    """Map language code to KDP language name."""
    mapping = {
        "de": "German",
        "en": "English",
        "es": "Spanish",
        "fr": "French",
        "it": "Italian",
        "pt": "Portuguese",
        "nl": "Dutch",
        "ja": "Japanese",
        "zh": "Chinese",
        "ko": "Korean",
        "el": "Greek",
    }
    return mapping.get(lang, lang)
