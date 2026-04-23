"""Core in-process import handlers.

Each handler in this package implements
:class:`app.import_plugins.protocol.ImportPlugin` and registers
itself with the registry at import time.

External plugins (``plugin-git-sync``, ``plugin-import-office``, ...)
register via pluggy and do NOT live here.
"""

from app.import_plugins.handlers.bgb import BgbImportHandler
from app.import_plugins.registry import register

# Core handlers register themselves at module import time. Order defines
# priority: the .bgb handler goes first so a .bgb file is never
# mis-dispatched to a generic ZIP or markdown handler.
register(BgbImportHandler())
