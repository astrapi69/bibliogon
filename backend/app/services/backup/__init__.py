"""Backup, restore and project-import services.

The router (`app/routers/backup.py`) is intentionally thin and delegates
all business logic to the modules in this package:

- ``serializer``      Book ORM <-> dict round-trip for backup files.
- ``markdown_utils``  Markdown -> HTML, title extraction, chapter type maps.
- ``asset_utils``     Asset import and image-path rewriting.
- ``archive_utils``   Archive layout discovery (manifest, books dir, project root).
- ``backup_export``   Build a .bgb full-data backup ZIP.
- ``backup_import``   Restore from a .bgb file.
- ``project_import``  Helpers used by ``WbtImportHandler`` (metadata parsing,
  chapter/asset import, cover detection). The old UploadFile-based
  ``import_project_zip`` / ``smart_import_file`` were removed in CIO-05
  after the orchestrator (``app.import_plugins``) took over every
  import path.
"""

from app.services.backup.backup_compare import compare_backups
from app.services.backup.backup_export import export_backup_archive
from app.services.backup.backup_import import import_backup_archive
from app.services.backup.serializer import (
    restore_book_from_data,
    serialize_book_for_backup,
)

__all__ = [
    "compare_backups",
    "export_backup_archive",
    "import_backup_archive",
    "restore_book_from_data",
    "serialize_book_for_backup",
]
