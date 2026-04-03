#!/usr/bin/env bash
set -e

# ============================================================
#  Bibliogon - Start Script
#  Starts the book authoring platform via Docker Compose.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ____  _ _     _ _                         "
echo " | __ )(_) |__ | (_) ___   __ _  ___  _ __  "
echo " |  _ \\| | '_ \\| | |/ _ \\ / _\` |/ _ \\| '_ \\ "
echo " | |_) | | |_) | | | (_) | (_| | (_) | | | |"
echo " |____/|_|_.__/|_|_|\\___/ \\__, |\\___/|_| |_|"
echo "                          |___/              "
echo -e "${NC}"
echo "  Open-source book authoring platform"
echo ""

# --- Check Docker ---
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed.${NC}"
    echo "Please install Docker: https://docs.docker.com/get-docker/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running.${NC}"
    echo "Please start Docker and try again."
    exit 1
fi

echo -e "${GREEN}Docker found.${NC}"

# --- Create .env if missing ---
if [ ! -f .env ]; then
    echo -e "${YELLOW}No .env file found. Creating from .env.example...${NC}"
    cp .env.example .env

    # Generate random secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || \
             openssl rand -hex 32 2>/dev/null || \
             head -c 32 /dev/urandom | xxd -p 2>/dev/null || \
             echo "bibliogon-$(date +%s)-$(shuf -i 1000-9999 -n 1)")

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/change-me-to-a-random-secret/$SECRET/" .env
    else
        sed -i "s/change-me-to-a-random-secret/$SECRET/" .env
    fi

    echo -e "${GREEN}.env created with generated secret key.${NC}"
fi

# --- Read port from .env ---
PORT=$(grep -E '^BIBLIOGON_PORT=' .env 2>/dev/null | cut -d= -f2 || echo "7880")
PORT=${PORT:-7880}

# --- Build and start ---
echo ""
echo -e "${BLUE}Starting Bibliogon...${NC}"
echo ""

docker compose -f docker-compose.prod.yml up --build -d

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bibliogon is running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Open in browser: ${BLUE}http://localhost:${PORT}${NC}"
echo ""
echo -e "  Stop:  ${YELLOW}./stop.sh${NC}  or  ${YELLOW}docker compose -f docker-compose.prod.yml down${NC}"
echo -e "  Logs:  ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo ""
