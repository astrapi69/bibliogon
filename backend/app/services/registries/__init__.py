"""YAML-backed type registries (grouped sub-package).

Each module loads + validates a type-definition registry from its
backend/config YAML SSoT:
  - book_type_registry: Book.book_type definitions
  - content_type_registry: Article.content_type definitions
  - story_entity_registry: StoryEntity.entity_type definitions

Module basenames keep their ``_registry`` suffix so importers change
only the package path (no call-site / monkeypatch alias churn).
"""
