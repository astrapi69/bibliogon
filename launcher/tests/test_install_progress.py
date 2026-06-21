"""Tests for install-progress reporting (issue #518, Problem 2).

Covers the human-readable size helper, the streamed-download progress
callback in ``installer``, and the pure checklist-state builder in
``__main__``. UI rendering (``StatusWindow``) needs a display and is
not exercised here; these tests pin the testable layers the UI consumes.
"""

from __future__ import annotations

import io
from pathlib import Path
from unittest.mock import patch

from bibliogon_launcher import installer


class TestHumanSize:

    def test_zero_and_negative(self) -> None:
        assert installer.human_size(0) == "0 B"
        assert installer.human_size(-5) == "0 B"

    def test_bytes(self) -> None:
        assert installer.human_size(512) == "512 B"

    def test_megabytes(self) -> None:
        assert installer.human_size(245 * 1024 * 1024) == "245 MB"

    def test_gigabytes(self) -> None:
        assert installer.human_size(2 * 1024 * 1024 * 1024) == "2 GB"


class _FakeResponse:
    """Minimal urlopen-response stand-in for the streaming reader."""

    def __init__(self, payload: bytes, content_length: str | None) -> None:
        self._buf = io.BytesIO(payload)
        self.headers = {} if content_length is None else {"Content-Length": content_length}

    def read(self, size: int = -1) -> bytes:
        return self._buf.read(size)


class TestStreamToFile:

    def test_reports_progress_with_known_total(self) -> None:
        payload = b"x" * (300 * 1024)  # spans two 256 KiB chunks
        resp = _FakeResponse(payload, content_length=str(len(payload)))
        out = io.BytesIO()
        calls: list[tuple[int, int]] = []

        installer._stream_to_file(resp, out, lambda d, t: calls.append((d, t)))

        assert out.getvalue() == payload
        assert calls[0] == (0, len(payload))  # initial 0% tick
        assert calls[-1] == (len(payload), len(payload))  # final 100%
        # Every reported total matches the Content-Length.
        assert all(total == len(payload) for _, total in calls)

    def test_total_zero_when_no_content_length(self) -> None:
        payload = b"y" * 1024
        resp = _FakeResponse(payload, content_length=None)
        out = io.BytesIO()
        calls: list[tuple[int, int]] = []

        installer._stream_to_file(resp, out, lambda d, t: calls.append((d, t)))

        assert out.getvalue() == payload
        assert all(total == 0 for _, total in calls)

    def test_callback_exception_does_not_abort_download(self) -> None:
        payload = b"z" * 2048
        resp = _FakeResponse(payload, content_length=str(len(payload)))
        out = io.BytesIO()

        def boom(_d: int, _t: int) -> None:
            raise RuntimeError("observer broke")

        installer._stream_to_file(resp, out, boom)
        assert out.getvalue() == payload  # download completed regardless


class TestDownloadReleaseProgress:

    def test_progress_callback_is_threaded_through(self, tmp_path: Path) -> None:
        payload = b"PK" + b"0" * 4096  # bytes only; zip validity mocked below
        resp = _FakeResponse(payload, content_length=str(len(payload)))
        seen: list[tuple[int, int]] = []

        def fake_urlopen(url, timeout=0):  # noqa: ANN001
            return _CtxWrap(resp)

        with (
            patch.object(installer, "urlopen", fake_urlopen),
            patch.object(installer.zipfile, "is_zipfile", return_value=True),
            patch.object(installer.zipfile, "ZipFile") as zf,
        ):
            zf.return_value.__enter__.return_value.namelist.return_value = ["bibliogon-1/"]
            zf.return_value.__enter__.return_value.infolist.return_value = []
            ok, _ = installer.download_release(
                tmp_path, version="1.0.0", progress_callback=lambda d, t: seen.append((d, t))
            )

        assert ok is True
        assert seen, "progress callback was never invoked"
        assert seen[-1][0] == len(payload)


class _CtxWrap:
    """Wrap a fake response so ``with urlopen(...) as resp`` works."""

    def __init__(self, resp: _FakeResponse) -> None:
        self._resp = resp

    def __enter__(self) -> _FakeResponse:
        return self._resp

    def __exit__(self, *exc: object) -> None:
        return None


class TestChecklistStates:
    """``__main__._checklist_states`` maps step keys to render statuses."""

    STEPS = (("a", "Step A"), ("b", "Step B"), ("c", "Step C"))

    def test_active_and_pending(self) -> None:
        from bibliogon_launcher import __main__ as main_mod

        items = main_mod._checklist_states(self.STEPS, done=set(), active="a")
        assert items == [("Step A", "active"), ("Step B", "pending"), ("Step C", "pending")]

    def test_done_and_active_mix(self) -> None:
        from bibliogon_launcher import __main__ as main_mod

        items = main_mod._checklist_states(self.STEPS, done={"a"}, active="b")
        assert items == [("Step A", "done"), ("Step B", "active"), ("Step C", "pending")]

    def test_all_done(self) -> None:
        from bibliogon_launcher import __main__ as main_mod

        items = main_mod._checklist_states(self.STEPS, done={"a", "b", "c"}, active=None)
        assert [status for _, status in items] == ["done", "done", "done"]
