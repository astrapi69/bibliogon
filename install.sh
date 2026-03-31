#!/usr/bin/env bash
set -e

# ============================================================
#  Bibliogon Installer
#  Downloads and starts the book authoring platform.
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash
#
#  Or download and run:
#    chmod +x install.sh && ./install.sh
# ============================================================

VERSION="${BIBLIOGON_VERSION:-v0.7.0}"
REPO="astrapi69/bibliogon"
INSTALL_DIR="${BIBLIOGON_DIR:-$HOME/bibliogon}"

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
echo "  Version: ${VERSION}"
echo ""

# --- Check Docker ---
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Fehler: Docker ist nicht installiert.${NC}"
    echo ""
    echo "Bitte installiere Docker:"
    echo "  https://docs.docker.com/get-docker/"
    echo ""
    echo "Danach erneut ausfuehren:"
    echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}Fehler: Docker laeuft nicht.${NC}"
    echo "Bitte starte Docker und versuche es erneut."
    exit 1
fi

if ! docker compose version &> /dev/null 2>&1; then
    echo -e "${RED}Fehler: Docker Compose ist nicht verfuegbar.${NC}"
    echo "Bitte installiere Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

echo -e "${GREEN}Docker und Docker Compose gefunden.${NC}"

# --- Download ---
if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}Bibliogon ist bereits installiert in ${INSTALL_DIR}${NC}"
    echo "Aktualisiere..."
    cd "$INSTALL_DIR"
    git fetch origin
    git checkout "$VERSION" 2>/dev/null || git checkout main
    git pull origin main 2>/dev/null || true
else
    echo -e "${BLUE}Lade Bibliogon ${VERSION} herunter...${NC}"

    # Try git clone first (preferred)
    if command -v git &> /dev/null; then
        git clone --depth 1 --branch "$VERSION" "https://github.com/${REPO}.git" "$INSTALL_DIR" 2>/dev/null || \
        git clone --depth 1 "https://github.com/${REPO}.git" "$INSTALL_DIR"
    else
        # Fallback: download tarball
        echo "Git nicht gefunden, lade Archiv herunter..."
        mkdir -p "$INSTALL_DIR"
        TARBALL_URL="https://github.com/${REPO}/archive/refs/tags/${VERSION}.tar.gz"
        if command -v curl &> /dev/null; then
            curl -fsSL "$TARBALL_URL" | tar xz --strip-components=1 -C "$INSTALL_DIR" 2>/dev/null || {
                # Tag might not exist yet, try main
                curl -fsSL "https://github.com/${REPO}/archive/refs/heads/main.tar.gz" | tar xz --strip-components=1 -C "$INSTALL_DIR"
            }
        elif command -v wget &> /dev/null; then
            wget -qO- "$TARBALL_URL" | tar xz --strip-components=1 -C "$INSTALL_DIR" 2>/dev/null || {
                wget -qO- "https://github.com/${REPO}/archive/refs/heads/main.tar.gz" | tar xz --strip-components=1 -C "$INSTALL_DIR"
            }
        else
            echo -e "${RED}Fehler: Weder git, curl noch wget gefunden.${NC}"
            exit 1
        fi
    fi
fi

cd "$INSTALL_DIR"

# --- Create .env if missing ---
if [ ! -f .env ]; then
    echo -e "${YELLOW}Erstelle Konfiguration...${NC}"
    cp .env.example .env

    # Generate random secret key
    SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || \
             openssl rand -hex 32 2>/dev/null || \
             head -c 32 /dev/urandom | xxd -p 2>/dev/null || \
             echo "bibliogon-$(date +%s)-random")

    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/change-me-to-a-random-secret/$SECRET/" .env
    else
        sed -i "s/change-me-to-a-random-secret/$SECRET/" .env
    fi

    echo -e "${GREEN}Konfiguration erstellt.${NC}"
fi

# --- Read port from .env ---
PORT=$(grep -E '^BIBLIOGON_PORT=' .env 2>/dev/null | cut -d= -f2 || echo "7880")
PORT=${PORT:-7880}

# --- Build and start ---
echo ""
echo -e "${BLUE}Baue und starte Bibliogon (das kann beim ersten Mal einige Minuten dauern)...${NC}"
echo ""

docker compose -f docker-compose.prod.yml up --build -d

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bibliogon laeuft!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Oeffne: ${BLUE}http://localhost:${PORT}${NC}"
echo ""
echo -e "  Installiert in: ${INSTALL_DIR}"
echo ""
echo -e "  Stoppen:        ${YELLOW}cd ${INSTALL_DIR} && ./stop.sh${NC}"
echo -e "  Starten:        ${YELLOW}cd ${INSTALL_DIR} && ./start.sh${NC}"
echo -e "  Deinstallieren: ${YELLOW}cd ${INSTALL_DIR} && ./stop.sh && cd ~ && rm -rf ${INSTALL_DIR}${NC}"
echo ""
