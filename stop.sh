#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stopping Bibliogon..."

# Stop docker if running
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

# Stop native dev processes
pkill -f "uvicorn.*bibliogon" 2>/dev/null || true
pkill -f "vite.*bibliogon" 2>/dev/null || true

echo "Bibliogon stopped."