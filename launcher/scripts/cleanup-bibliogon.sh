#!/usr/bin/env bash
# Standalone Bibliogon teardown for Linux/macOS.
#
# Mirrors the launcher's reusable uninstall (bibliogon_launcher.cleanup
# .uninstall_bibliogon) but works even when the Python launcher is not
# installed. Stops and removes the Bibliogon Docker stack, removes its
# images, deletes its data volumes (with confirmation), and removes the
# per-user config directories and desktop shortcuts.
#
# Usage:
#   ./cleanup-bibliogon.sh [PORT]
# PORT (optional, default 7880) is only used for the final free-port
# report so you can confirm nothing is still listening.

set -euo pipefail

PROJECT="bibliogon"
PORT="${1:-7880}"

have_docker() { command -v docker >/dev/null 2>&1; }

echo "Bibliogon cleanup"
echo "================="

if have_docker; then
  echo "Stopping the Bibliogon stack..."
  docker compose -p "$PROJECT" down 2>/dev/null || true

  echo "Removing leftover Bibliogon containers..."
  containers="$(docker ps -aq --filter "label=com.docker.compose.project=${PROJECT}" 2>/dev/null || true)"
  if [ -n "$containers" ]; then
    docker rm -f $containers >/dev/null 2>&1 || true
  fi

  echo "Removing Bibliogon images..."
  images="$(docker images -q --filter "reference=*bibliogon*" 2>/dev/null || true)"
  if [ -n "$images" ]; then
    docker image rm -f $images >/dev/null 2>&1 || true
  fi

  volumes="$(docker volume ls -q --filter "name=bibliogon" 2>/dev/null || true)"
  if [ -n "$volumes" ]; then
    echo
    echo "WARNING: the following Docker volumes hold your book data and will be DELETED:"
    echo "$volumes" | sed 's/^/  - /'
    printf "Delete these volumes? [y/N] "
    read -r answer
    case "$answer" in
      [yY]*) docker volume rm $volumes >/dev/null 2>&1 || true; echo "Volumes removed." ;;
      *) echo "Kept volumes." ;;
    esac
  fi
else
  echo "Docker not found on PATH; skipping container/image/volume cleanup."
fi

echo "Removing per-user config directories..."
for dir in "$HOME/.bibliogon" "$HOME/.config/bibliogon" "$HOME/.config/Bibliogon" \
           "$HOME/Library/Application Support/bibliogon"; do
  [ -d "$dir" ] && rm -rf "$dir" && echo "  removed $dir"
done

echo "Removing desktop shortcuts..."
for shortcut in "$HOME/Desktop/bibliogon.desktop" \
                "$HOME/.local/share/applications/bibliogon.desktop"; do
  [ -f "$shortcut" ] && rm -f "$shortcut" && echo "  removed $shortcut"
done

if command -v lsof >/dev/null 2>&1; then
  if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Note: port $PORT is still in use by another process."
  else
    echo "Port $PORT is free."
  fi
fi

echo
echo "Cleanup complete."
