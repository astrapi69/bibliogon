"""Typed A+ Content package shape (#825).

Fields are plain strings with no Pydantic-level length constraint on
purpose: an over-length AI response must surface as a structured
``ValidationFinding`` (so the caller sees WHY and WHERE), not as a
raw Pydantic ``ValidationError`` that crashes the generation call.
The deterministic validator enforces every limit from the ruleset.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["error", "warning"]


class ValidationFinding(BaseModel):
    """One deterministic-validator result, attached to the field it
    concerns so a UI can highlight exactly the offending section."""

    field: str
    severity: Severity
    message: str


class Bullet(BaseModel):
    heading: str = ""
    body: str = ""


class AplusImage(BaseModel):
    """One image slot: the model's keyword prompt plus the slot's
    technical parameters from the ruleset's ``image_style`` block
    (#865). These are the persisted parts. The copy-and-paste form
    (``rendered``) is derived per response by
    ``image_prompts.with_rendered_prompts`` and is deliberately not a
    field here, so it can never be stored or cached."""

    prompt: str = ""
    aspect_ratio: str = ""
    size: str = ""
    style_flags: list[str] = Field(default_factory=list)


class ModuleHeader(BaseModel):
    title: str = ""
    text: str = ""
    image: AplusImage = Field(default_factory=AplusImage)
    alt_text: str = ""


class ThreeImageEntry(BaseModel):
    title: str = ""
    text: str = ""
    image: AplusImage = Field(default_factory=AplusImage)
    alt_text: str = ""


class AplusMeta(BaseModel):
    book_id: str
    language: str
    model: str = ""
    ruleset_version: str
    generated_at: str


class MissingFieldFinding(BaseModel):
    """One missing-required-field entry, returned instead of a
    generated package so the caller (UI) can prompt for exactly this
    field rather than receiving a generic error."""

    field: str
    reason: str


class MissingFieldsResponse(BaseModel):
    book_id: str
    missing_fields: list[MissingFieldFinding]


class AplusPackage(BaseModel):
    """The full generated A+ Content package."""

    short_description: str = ""
    bullets: list[Bullet] = Field(default_factory=list)
    module_header: ModuleHeader = Field(default_factory=ModuleHeader)
    module_three_images: list[ThreeImageEntry] = Field(default_factory=list)
    validation: list[ValidationFinding] = Field(default_factory=list)
    meta: AplusMeta

    @property
    def has_errors(self) -> bool:
        return any(finding.severity == "error" for finding in self.validation)


TEMPLATE_PATTERN = r"^[a-z0-9_]{1,40}$"
"""Module template ids are slugs; the template catalog itself lives in the
frontend (``lib/aplus/moduleTemplates``) so a new template ships without a
backend change. The backend only guards the shape."""

MAX_MODULES = 20
MAX_SLOTS = 10
MAX_BULLETS = 10
MAX_ROWS = 20
MAX_ROW_VALUES = 10
MAX_FIELDS = 40


class AplusDocumentSlot(BaseModel):
    """One content slot of a module: an image with its title and text.

    Like the generated package, fields carry no length limit here: the
    limits are advisory counters in the editor, and an over-length draft
    must still save rather than be rejected mid-edit.
    """

    title: str = ""
    text: str = ""
    image_prompt: str = ""
    alt_text: str = ""
    caption: str = ""
    asin: str = ""


class AplusDocumentRow(BaseModel):
    """A table row: comparison-chart metric (one value per column) or a
    tech-specs name/definition pair (one value)."""

    label: str = ""
    values: list[str] = Field(default_factory=list, max_length=MAX_ROW_VALUES)


class AplusDocumentModule(BaseModel):
    """One A+ module built from a template of the frontend catalog (#895):
    module headline, image slots, module-level texts keyed by the template's
    field keys, and table rows for the comparison chart and tech specs."""

    id: str = Field(min_length=1, max_length=64)
    template: str = Field(pattern=TEMPLATE_PATTERN)
    module_title: str = ""
    slots: list[AplusDocumentSlot] = Field(default_factory=list, max_length=MAX_SLOTS)
    fields: dict[str, str] = Field(default_factory=dict, max_length=MAX_FIELDS)
    rows: list[AplusDocumentRow] = Field(default_factory=list, max_length=MAX_ROWS)


class AplusDocumentBody(BaseModel):
    """The author's editable A+ Content for one book and language (#891)."""

    content_name: str = ""
    short_description: str = ""
    bullets: list[Bullet] = Field(default_factory=list, max_length=MAX_BULLETS)
    modules: list[AplusDocumentModule] = Field(default_factory=list, max_length=MAX_MODULES)


class AplusDocumentResponse(AplusDocumentBody):
    book_id: str
    language: str
    updated_at: str
