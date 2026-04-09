"""Backup, restore and project-import services.

The router (`app/routers/backup.py`) is intentionally thin and delegates
all business logic to the modules in this package:

- ``serializer``      Book ORM <-> dict round-trip for backup files.
- ``markdown_utils``  Markdown -> HTML, title extraction, chapter type maps.
- ``asset_utils``     Asset import and image-path rewriting.
- ``archive_utils``   Archive layout discovery (manifest, books dir, project root).
- ``backup_export``   Build a .bgb full-data backup ZIP.
- ``backup_import``   Restore from a .bgb file.
- ``project_import``  Import a write-book-template (.bgp/.zip) project.
- ``markdown_import`` Import single .md files or plain Markdown ZIPs.
- ``smart_import``    Auto-detect and dispatch to the right importer.
"""

from app.services.backup.backup_export import export_backup_archive
from app.services.backup.backup_import import import_backup_archive
from app.services.backup.markdown_import import (
    import_plain_markdown_zip,
    import_single_markdown,
)
from app.services.backup.project_import import import_project_zip
from app.services.backup.serializer import (
    restore_book_from_data,
    serialize_book_for_backup,
)
from app.services.backup.smart_import import smart_import_file

__all__ = [
    "export_backup_archive",
    "import_backup_archive",
    "import_plain_markdown_zip",
    "import_project_zip",
    "import_single_markdown",
    "restore_book_from_data",
    "serialize_book_for_backup",
    "smart_import_file",
]
