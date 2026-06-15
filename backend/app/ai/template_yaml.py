"""YAML serialize/parse for Bibliogon AI templates.

Extracted from ``ai/template_schema.py`` (God-file split #10, 2026-06-14).
"""

import yaml
from pydantic import ValidationError

from app.ai.template_headers import ARTICLE_HEADER, BOOK_HEADER
from app.ai.template_models import (
    SCHEMA_VERSION,
    ArticleTemplate,
    BookTemplate,
    TemplateModel,
    TemplateSchemaError,
)

_OPTIONAL_ROOT_KEYS = ("reference", "language")


def serialize_template_to_yaml(template: TemplateModel, include_header: bool = True) -> str:
    """Render a template as YAML. With ``include_header=True``
    (default) the top-of-file rules-for-AI comment block is
    prepended; otherwise pure YAML body is returned (used by
    bulk-export ZIP tests that diff content without header
    noise).

    Field order is preserved via Pydantic's declaration order +
    ``sort_keys=False``. The three-keys-per-field contract
    (``description`` + ``example`` + ``current_value``) is
    preserved verbatim - we do NOT use ``exclude_none``
    blanket-wide because that would drop ``current_value: null``
    from unset fields and break the "every field has three keys"
    invariant. Instead, only the optional ROOT-level keys
    (``reference`` and ``language``) are dropped when None, so
    empty templates skip the reference block cleanly while
    per-field current_value=null stays in the output."""
    body = template.model_dump()
    for key in _OPTIONAL_ROOT_KEYS:
        if body.get(key) is None:
            body.pop(key, None)
    yaml_body = yaml.safe_dump(
        body,
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    if not include_header:
        return yaml_body
    header = ARTICLE_HEADER if isinstance(template, ArticleTemplate) else BOOK_HEADER
    return header + "\n" + yaml_body


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def parse_template_from_yaml(yaml_str: str) -> TemplateModel:
    """Parse a template YAML string into an ``ArticleTemplate``
    or ``BookTemplate`` dispatched on the ``type`` discriminator.
    Comments are silently dropped by PyYAML; the rules-for-AI
    header survives only via the regenerated header at export
    time (documented in lessons-learned).

    Raises:
        TemplateSchemaError: on malformed YAML, missing or
            unknown ``type``, or unsupported ``schema_version``.
    """
    try:
        body = yaml.safe_load(yaml_str)
    except yaml.YAMLError as exc:
        raise TemplateSchemaError(f"Malformed YAML: {exc}") from exc

    if not isinstance(body, dict):
        raise TemplateSchemaError("Template root must be a mapping")

    schema_version = body.get("schema_version")
    if schema_version != SCHEMA_VERSION:
        raise TemplateSchemaError(
            f"Unsupported schema_version {schema_version!r}; expected {SCHEMA_VERSION}"
        )

    type_ = body.get("type")
    if type_ == "article":
        model_cls: type[TemplateModel] = ArticleTemplate
    elif type_ == "book":
        model_cls = BookTemplate
    else:
        raise TemplateSchemaError(f"Unknown template type {type_!r}; expected 'article' or 'book'")

    try:
        return model_cls.model_validate(body)
    except ValidationError as exc:
        raise TemplateSchemaError(f"Template structure invalid: {exc}") from exc


# ---------------------------------------------------------------------------
