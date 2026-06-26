"""Pins the shared-state cleanup of the debug test-reset path.

``_reset_shared_infra`` is called by ``DELETE /api/test/reset`` after the
content-table wipe to clear the process/disk state the wipe misses, so
each e2e test runs against a backend as fresh as the first
(E2E-isolation audit 2026-06-22, Option A). This pins that it actually
clears jobs, orphaned upload files, and the config caches.
"""

from app.job_store import job_store
from app.paths import get_upload_dir
from app.routes_admin import _reset_shared_infra
from app.services.platform_schema import load_platform_schemas


def test_reset_shared_infra_clears_jobs_files_and_caches():
    # In-flight job in the singleton store.
    job = job_store.create()
    assert job_store.get(job.id) is not None

    # Orphaned upload files (a loose file + a nested article dir).
    upload_dir = get_upload_dir()
    upload_dir.mkdir(parents=True, exist_ok=True)
    loose = upload_dir / "orphan.png"
    loose.write_bytes(b"x")
    nested = upload_dir / "articles" / "abc123"
    nested.mkdir(parents=True, exist_ok=True)
    (nested / "imported_image").write_bytes(b"y")

    # Prime a config cache so we can assert it was cleared.
    load_platform_schemas()
    assert load_platform_schemas.cache_info().currsize >= 1

    _reset_shared_infra()

    # Job store emptied.
    assert job_store.get(job.id) is None
    # Upload files removed (loose file + nested dir).
    assert not loose.exists()
    assert not nested.exists()
    # Config cache cleared.
    assert load_platform_schemas.cache_info().currsize == 0
