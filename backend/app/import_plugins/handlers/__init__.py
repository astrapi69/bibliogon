"""Core in-process import handlers.

Each handler in this package implements
:class:`app.import_plugins.protocol.ImportPlugin` and registers
itself with the registry at import time.

External plugins (``plugin-git-sync``, ``plugin-import-office``, ...)
register via pluggy and do NOT live here.
"""

from app.import_plugins.handlers.bgb import BgbImportHandler
from app.import_plugins.handlers.markdown import MarkdownImportHandler
from app.import_plugins.handlers.markdown_folder import MarkdownFolderHandler
from app.import_plugins.handlers.office import (
    DocxImportHandler,
    EpubImportHandler,
)
from app.import_plugins.handlers.wbt import WbtImportHandler
from app.import_plugins.registry import register

# Core handlers register themselves at module import time. Order defines
# priority:
# 1. .bgb wins first so a .bgb file is never mis-dispatched.
# 2. wbt-zip claims a ZIP with config/metadata.yaml inside, or a
#    directory that already is a WBT project root.
# 3. docx / epub each claim their own file extensions; disjoint with
#    everything above.
# 4. markdown-folder claims DIRECTORY inputs without a WBT marker.
# 5. single markdown is the universal fallback for .md/.markdown/.txt
#    file inputs.
register(BgbImportHandler())
register(WbtImportHandler())
register(DocxImportHandler())
register(EpubImportHandler())
register(MarkdownFolderHandler())
register(MarkdownImportHandler())
