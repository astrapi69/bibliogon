"""KDP report import and per-title profitability (#1129).

The pure modules (``money``, ``columns``, ``parsing``, ``evaluation``)
have no ``app`` import so the plugin-only test venv can run them; the
database side lives in ``service`` and the HTTP side in ``routes``.
"""
