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


class ModuleHeader(BaseModel):
    title: str = ""
    text: str = ""
    image_prompt: str = ""
    alt_text: str = ""


class ThreeImageEntry(BaseModel):
    title: str = ""
    text: str = ""
    image_prompt: str = ""
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
