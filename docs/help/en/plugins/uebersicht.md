# Plugins Overview

Bibliogon uses a modular plugin architecture based on PluginForge (pluggy). Core plugins (Export, Help, Get Started, MS-Tools) are free and MIT-licensed. Premium plugins (Audiobook, Translation, Grammar) require a license key.

Plugins register automatically at startup and provide API endpoints and UI extensions via a frontend manifest. Third-party plugins can be installed as ZIP files through Settings > Plugins. Each plugin declares UI slots (sidebar actions, toolbar buttons, editor panels, settings sections, export options) without modifying the application core.
