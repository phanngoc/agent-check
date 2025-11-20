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

# Check if cargo-watch is installed
if ! command -v cargo-watch &> /dev/null; then
    echo -e "${RED}❌ cargo-watch is not installed!${NC}"
    echo -e "${YELLOW}Please install it with: cargo install cargo-watch${NC}"
    exit 1
fi

echo -e "${GREEN}🚀 Starting Rust Panel with hot reloading...${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${BLUE}Watching for changes in src/ directory${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Run cargo-watch with hot reloading
# -x 'run' : execute 'cargo run' on changes
# -w src : watch only src directory
# -d 0.2 : delay 0.2 seconds before rebuilding (debounce)
# -c : clear screen on rebuild
cargo watch -x 'run' -w src -d 0.2 -c

