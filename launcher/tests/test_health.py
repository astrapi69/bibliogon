"""Tests for launcher.health. urllib is mocked to avoid network I/O."""

from __future__ import annotations

import json
from io import BytesIO
from unittest.mock import MagicMock, patch

import urllib.error

from bibliogon_launcher import health


def _fake_response(status: int, body: dict | str) -> MagicMock:
    resp = MagicMock()
    resp.status = status
    if isinstance(body, dict):
        body = json.dumps(body)
    resp.read.return_value = body.encode("utf-8")
    resp.__enter__ = MagicMock(return_value=resp)
    resp.__exit__ = MagicMock(return_value=False)
    return resp


class TestIsHealthy:

    def test_true_when_status_ok(self) -> None:
        with patch("urllib.request.urlopen", return_value=_fake_response(200, {"status": "ok"})):
            assert health.is_healthy(7880) is True

    def test_false_when_status_is_not_ok(self) -> None:
        with patch("urllib.request.urlopen", return_value=_fake_response(200, {"status": "degraded"})):
            assert health.is_healthy(7880) is False

    def test_false_on_non_200(self) -> None:
        with patch("urllib.request.urlopen", return_value=_fake_response(503, {"status": "ok"})):
            assert health.is_healthy(7880) is False

    def test_false_on_url_error(self) -> None:
        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("boom")):
            assert health.is_healthy(7880) is False

    def test_false_on_connection_refused(self) -> None:
        with patch("urllib.request.urlopen", side_effect=ConnectionRefusedError()):
            assert health.is_healthy(7880) is False

    def test_false_on_invalid_json(self) -> None:
        with patch("urllib.request.urlopen", return_value=_fake_response(200, "not json at all")):
            assert health.is_healthy(7880) is False


class TestWaitForHealthy:

    def test_returns_true_on_first_success(self) -> None:
        with patch("bibliogon_launcher.health.is_healthy", return_value=True) as mock_check:
            assert health.wait_for_healthy(7880, timeout_seconds=10.0) is True
        mock_check.assert_called_once_with(7880)

    def test_retries_until_success(self) -> None:
        # Sequence: fail, fail, succeed
        results = iter([False, False, True])
        times = iter([0.0, 0.5, 1.0, 1.5])
        sleeps: list[float] = []

        with patch("bibliogon_launcher.health.is_healthy", side_effect=lambda _: next(results)):
            assert health.wait_for_healthy(
                7880,
                timeout_seconds=60.0,
                interval_seconds=0.5,
                clock=lambda: next(times),
                sleep=sleeps.append,
            ) is True
        assert sleeps == [0.5, 0.5]

    def test_returns_false_on_timeout(self) -> None:
        # Clock advances past deadline on the third call -> loop exits False.
        times = iter([0.0, 0.5, 1.5])
        sleeps: list[float] = []

        with patch("bibliogon_launcher.health.is_healthy", return_value=False):
            assert health.wait_for_healthy(
                7880,
                timeout_seconds=1.0,
                interval_seconds=0.5,
                clock=lambda: next(times),
                sleep=sleeps.append,
            ) is False
