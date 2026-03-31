#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Stoppe Bibliogon..."
docker compose -f docker-compose.prod.yml down
echo "Bibliogon gestoppt."
