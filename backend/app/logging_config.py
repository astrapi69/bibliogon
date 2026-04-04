"""Structured logging configuration for Bibliogon.

JSON format in production (BIBLIOGON_DEBUG=false), human-readable in development.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON for production."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)
        # Include extra fields if present
        for key in ("book_id", "plugin", "format", "error", "count", "days"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging() -> None:
    """Configure logging based on BIBLIOGON_DEBUG environment variable.

    - DEBUG=true: human-readable format with DEBUG level
    - DEBUG=false: JSON format with INFO level
    """
    debug = os.getenv("BIBLIOGON_DEBUG", "true").lower() in ("true", "1", "yes")

    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stderr)

    if debug:
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        )
        handler.setFormatter(formatter)
        root.setLevel(logging.DEBUG)
    else:
        handler.setFormatter(JsonFormatter())
        root.setLevel(logging.INFO)

    root.addHandler(handler)

    # Quiet noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("alembic").setLevel(logging.INFO)
