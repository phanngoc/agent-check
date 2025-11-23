#!/bin/bash

# Development script for Rust Panel with hot reloading using cargo-watch
# This script automatically rebuilds and restarts the panel when code changes

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if cargo-watch is installed, if not try alternatives
USE_CARGO_WATCH=false
USE_WATCHEXEC=false

if command -v cargo-watch &> /dev/null; then
    USE_CARGO_WATCH=true
elif command -v watchexec &> /dev/null; then
    USE_WATCHEXEC=true
    echo -e "${YELLOW}⚠️  cargo-watch not found, using watchexec instead${NC}"
else
    echo -e "${YELLOW}⚠️  No hot reload tool found. Trying to install cargo-watch...${NC}"
    echo -e "${BLUE}This may take a few minutes...${NC}"
    
    # Try to install cargo-watch with minimal features
    if cargo install cargo-watch --no-default-features --features watchexec-notify 2>&1; then
        USE_CARGO_WATCH=true
        echo -e "${GREEN}✅ cargo-watch installed successfully!${NC}"
    else
        echo -e "${RED}❌ Failed to install cargo-watch${NC}"
        echo -e "${YELLOW}You can install watchexec as alternative: brew install watchexec${NC}"
        echo -e "${YELLOW}Or run without hot reload (manual restart required)${NC}"
    fi
fi

# Function to kill process on a port
kill_port() {
    local port=$1
    if [ -z "$port" ]; then
        port=9000  # Default port
    fi
    
    echo -e "${YELLOW}🔍 Checking for process on port ${port}...${NC}"
    
    # Find and kill process on the port (works on macOS and Linux)
    if lsof -ti:$port > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Found process on port ${port}, killing it...${NC}"
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 1
        echo -e "${GREEN}✅ Port ${port} is now free${NC}"
    else
        echo -e "${GREEN}✅ Port ${port} is already free${NC}"
    fi
}

# Kill port before starting
kill_port 9000

echo -e "${GREEN}🚀 Starting Rust Panel...${NC}"
echo -e "${CYAN}========================================${NC}"

if [ "$USE_CARGO_WATCH" = true ]; then
    echo -e "${BLUE}Watching for changes in src/ directory (cargo-watch)${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    # Run cargo-watch with hot reloading
    cargo watch -x 'run' -w src -d 0.2 -c
elif [ "$USE_WATCHEXEC" = true ]; then
    echo -e "${BLUE}Watching for changes in src/ directory (watchexec)${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""
    # Run with watchexec
    watchexec -w src -d 200ms -c -- cargo run
else
    echo -e "${BLUE}Running without hot reload${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo -e "${CYAN}Note: You'll need to manually restart after code changes${NC}"
    echo ""
    cargo run
fi

