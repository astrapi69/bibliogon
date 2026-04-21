"""FastAPI router for SSH key management (Phase 3 of git-based backup).

Endpoints live under ``/api/ssh/`` because the keypair is per-install,
not per-book. A book's remote URL may or may not use SSH; the same
keypair serves all SSH remotes configured across books.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services import ssh_keys

router = APIRouter(prefix="/ssh", tags=["ssh"])


class GenerateRequest(BaseModel):
    comment: str | None = Field(default=None, max_length=200)
    overwrite: bool = False


class KeyInfo(BaseModel):
    exists: bool
    type: str | None = None
    comment: str | None = None
    created_at: str | None = None
    public_key: str | None = None


@router.post("/generate", response_model=KeyInfo)
def generate(payload: GenerateRequest | None = None) -> dict[str, Any]:
    data = payload or GenerateRequest()
    try:
        ssh_keys.generate(comment=data.comment, overwrite=data.overwrite)
    except ssh_keys.SshKeyExistsError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ssh_key_exists", "message": str(exc)},
        ) from exc
    except ssh_keys.SshKeyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    info = ssh_keys.get_metadata() or {"exists": False}
    return info


@router.get("", response_model=KeyInfo)
def get_info() -> dict[str, Any]:
    return ssh_keys.get_metadata() or {"exists": False}


@router.get("/public-key", response_model=dict[str, str])
def get_public_key() -> dict[str, str]:
    try:
        return {"public_key": ssh_keys.get_public_key()}
    except ssh_keys.SshKeyNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ssh_key_not_found", "message": str(exc)},
        ) from exc


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_key() -> None:
    ssh_keys.delete()
