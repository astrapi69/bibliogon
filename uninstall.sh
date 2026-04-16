#!/bin/sh
set -e

# ============================================================
#  Bibliogon Uninstaller
#
#  Removes the Bibliogon installation, Docker resources, and
#  launcher manifest in a single command.
#
#  Usage:
#    cd ~/bibliogon && bash uninstall.sh
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="docker-compose.prod.yml"

echo ""
echo -e "${RED}========================================${NC}"
echo -e "${RED}  Bibliogon Uninstaller${NC}"
echo -e "${RED}========================================${NC}"
echo ""
echo -e "${YELLOW}WARNING: This will permanently remove:${NC}"
echo ""
echo "  1. The Bibliogon Docker stack (containers)"
echo "  2. All Bibliogon Docker volumes (books, chapters, database)"
echo "  3. All Bibliogon Docker images"
echo "  4. The launcher configuration manifest"
echo "  5. The installation directory: ${INSTALL_DIR}"
echo ""
echo -e "${RED}Your books and chapters will be deleted.${NC}"
echo -e "${RED}Export your work BEFORE proceeding.${NC}"
echo ""
printf "Type 'yes' to confirm uninstall: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo ""
    echo "Uninstall cancelled."
    exit 0
fi

echo ""

# --- Step 1: Stop Docker stack ---
echo -e "${YELLOW}Stopping Bibliogon Docker stack...${NC}"
if [ -f "$INSTALL_DIR/$COMPOSE_FILE" ]; then
    docker compose -f "$INSTALL_DIR/$COMPOSE_FILE" down 2>/dev/null || true
    echo -e "${GREEN}  Stack stopped.${NC}"
else
    echo "  No compose file found, skipping."
fi

# --- Step 2: Remove Docker volumes ---
echo -e "${YELLOW}Removing Bibliogon Docker volumes...${NC}"
VOLUMES=$(docker volume ls --filter name=bibliogon -q 2>/dev/null || true)
if [ -n "$VOLUMES" ]; then
    echo "$VOLUMES" | xargs docker volume rm 2>/dev/null || true
    echo -e "${GREEN}  Volumes removed.${NC}"
else
    echo "  No Bibliogon volumes found."
fi

# --- Step 3: Remove Docker images ---
echo -e "${YELLOW}Removing Bibliogon Docker images...${NC}"
IMAGES=$(docker images --filter reference='*bibliogon*' -q 2>/dev/null || true)
if [ -n "$IMAGES" ]; then
    echo "$IMAGES" | xargs docker image rm --force 2>/dev/null || true
    echo -e "${GREEN}  Images removed.${NC}"
else
    echo "  No Bibliogon images found."
fi

# --- Step 4: Remove launcher manifest ---
echo -e "${YELLOW}Removing launcher manifest...${NC}"
MANIFEST_REMOVED="no"

# Detect platform and set manifest directory
OS_TYPE="$(uname -s 2>/dev/null || echo "unknown")"
case "$OS_TYPE" in
    MINGW*|MSYS*|CYGWIN*|Windows*)
        # Windows (Git Bash / MSYS2 / Cygwin)
        MANIFEST_DIR="${APPDATA}/bibliogon"
        ;;
    Darwin*)
        # macOS
        MANIFEST_DIR="${HOME}/Library/Application Support/bibliogon"
        ;;
    *)
        # Linux and other Unix
        MANIFEST_DIR="${HOME}/.config/bibliogon"
        ;;
esac

if [ -d "$MANIFEST_DIR" ]; then
    rm -rf "$MANIFEST_DIR"
    MANIFEST_REMOVED="yes"
    echo -e "${GREEN}  Manifest removed: ${MANIFEST_DIR}${NC}"
else
    echo "  No manifest directory found at: ${MANIFEST_DIR}"
fi

# Also remove legacy launcher.json if it exists under APPDATA/Bibliogon
# (capital B, used by the old launcher config path)
case "$OS_TYPE" in
    MINGW*|MSYS*|CYGWIN*|Windows*)
        LEGACY_DIR="${APPDATA}/Bibliogon"
        if [ -d "$LEGACY_DIR" ]; then
            rm -rf "$LEGACY_DIR"
            echo -e "${GREEN}  Legacy config removed: ${LEGACY_DIR}${NC}"
        fi
        ;;
esac

# --- Step 5: Remove install directory (last, since script lives here) ---
echo -e "${YELLOW}Removing installation directory...${NC}"
echo "  ${INSTALL_DIR}"
cd /
rm -rf "$INSTALL_DIR"
echo -e "${GREEN}  Directory removed.${NC}"

# --- Summary ---
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Bibliogon has been uninstalled.${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Removed:"
echo "    - Docker stack, volumes, and images"
echo "    - Launcher manifest ($MANIFEST_REMOVED)"
echo "    - Installation directory"
echo ""
echo "  To reinstall:"
echo "    curl -fsSL https://raw.githubusercontent.com/astrapi69/bibliogon/main/install.sh | bash"
echo ""
