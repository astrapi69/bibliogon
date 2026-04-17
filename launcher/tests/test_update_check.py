"""Tests for the launcher update_check module."""

from __future__ import annotations

import io
import json
import threading
import time
from unittest.mock import MagicMock, patch

from bibliogon_launcher import update_check


class TestIsNewer:

    def test_patch_bump(self) -> None:
        assert update_check.is_newer("0.16.0", "0.16.1") is True

    def test_minor_bump(self) -> None:
        assert update_check.is_newer("0.16.0", "0.17.0") is True

    def test_major_bump(self) -> None:
        assert update_check.is_newer("0.16.0", "1.0.0") is True

    def test_older(self) -> None:
        assert update_check.is_newer("0.17.0", "0.16.0") is False

    def test_equal(self) -> None:
        assert update_check.is_newer("0.16.0", "0.16.0") is False

    def test_strips_v_prefix(self) -> None:
        assert update_check.is_newer("0.16.0", "v0.17.0") is True
        assert update_check.is_newer("v0.16.0", "0.17.0") is True
        assert update_check.is_newer("v0.16.0", "v0.17.0") is True

    def test_malformed_tag_returns_false(self) -> None:
        """Any parse failure returns False - never a false-positive update prompt."""
        assert update_check.is_newer("0.16.0", "not-a-version") is False
        assert update_check.is_newer("broken", "0.17.0") is False
        assert update_check.is_newer("", "0.17.0") is False

    def test_different_component_counts(self) -> None:
        """Tuples compare lexicographically - shorter is less when equal prefix."""
        assert update_check.is_newer("0.16", "0.16.0") is True  # (0,16) < (0,16,0)
        assert update_check.is_newer("0.16.0", "0.16") is False


def _mock_response(body: dict) -> MagicMock:
    """Build a mock urlopen context manager returning the given JSON body."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(body).encode("utf-8")
    mock_resp.__enter__ = MagicMock(return_value=mock_resp)
    mock_resp.__exit__ = MagicMock(return_value=False)
    return mock_resp


class TestFetchLatestVersion:

    def test_returns_tag_and_url(self) -> None:
        body = {"tag_name": "v0.17.0", "html_url": "https://github.com/astrapi69/bibliogon/releases/tag/v0.17.0"}
        with patch("urllib.request.urlopen", return_value=_mock_response(body)):
            result = update_check.fetch_latest_version()
        assert result == ("v0.17.0", "https://github.com/astrapi69/bibliogon/releases/tag/v0.17.0")

    def test_network_error_returns_none(self) -> None:
        from urllib.error import URLError
        with patch("urllib.request.urlopen", side_effect=URLError("no network")):
            assert update_check.fetch_latest_version() is None

    def test_timeout_returns_none(self) -> None:
        with patch("urllib.request.urlopen", side_effect=TimeoutError("timed out")):
            assert update_check.fetch_latest_version() is None

    def test_malformed_json_returns_none(self) -> None:
        mock_resp = MagicMock()
        mock_resp.read.return_value = b"not json"
        mock_resp.__enter__ = MagicMock(return_value=mock_resp)
        mock_resp.__exit__ = MagicMock(return_value=False)
        with patch("urllib.request.urlopen", return_value=mock_resp):
            assert update_check.fetch_latest_version() is None

    def test_missing_tag_field_returns_none(self) -> None:
        body = {"html_url": "https://example.com"}  # no tag_name
        with patch("urllib.request.urlopen", return_value=_mock_response(body)):
            assert update_check.fetch_latest_version() is None

    def test_missing_url_field_returns_none(self) -> None:
        body = {"tag_name": "v0.17.0"}  # no html_url
        with patch("urllib.request.urlopen", return_value=_mock_response(body)):
            assert update_check.fetch_latest_version() is None


class TestCheckForUpdateAsync:
    """Verify the callback fires only when a strictly newer version is found."""

    def _run_and_wait(self, current: str, latest: tuple[str, str] | None) -> list:
        """Run check_for_update_async with mocked fetch; return callback args."""
        callback_args: list = []
        done = threading.Event()

        def callback(tag: str, url: str) -> None:
            callback_args.append((tag, url))
            done.set()

        with patch.object(update_check, "fetch_latest_version", return_value=latest):
            update_check.check_for_update_async(current, callback)
            # If no callback expected, wait briefly to ensure the thread finishes.
            done.wait(timeout=2.0)
        # Give the worker thread a moment to exit cleanly before returning.
        time.sleep(0.05)
        return callback_args

    def test_callback_fires_when_newer(self) -> None:
        calls = self._run_and_wait("0.16.0", ("v0.17.0", "https://example.com/release"))
        assert calls == [("v0.17.0", "https://example.com/release")]

    def test_no_callback_when_up_to_date(self) -> None:
        calls = self._run_and_wait("0.17.0", ("v0.17.0", "https://example.com/release"))
        assert calls == []

    def test_no_callback_when_current_is_newer(self) -> None:
        calls = self._run_and_wait("0.18.0", ("v0.17.0", "https://example.com/release"))
        assert calls == []

    def test_no_callback_on_fetch_failure(self) -> None:
        calls = self._run_and_wait("0.16.0", None)
        assert calls == []

    def test_broken_callback_does_not_crash(self) -> None:
        """A callback that raises must not propagate out of the thread."""
        def broken(tag: str, url: str) -> None:
            raise RuntimeError("subscriber bug")

        with patch.object(
            update_check, "fetch_latest_version",
            return_value=("v0.17.0", "https://example.com"),
        ):
            # Should not raise
            update_check.check_for_update_async("0.16.0", broken)
            time.sleep(0.1)  # let the thread run


class TestConstants:

    def test_releases_url_targets_correct_repo(self) -> None:
        assert "astrapi69/bibliogon" in update_check.RELEASES_URL
        assert update_check.RELEASES_URL.endswith("/releases/latest")

    def test_timeout_is_reasonable(self) -> None:
        assert 1 <= update_check.TIMEOUT_SECONDS <= 30
