#!/bin/bash

# Development script to run all 5 modules in parallel
# Backend (Go), Dashboard (Next.js), Tracker (TypeScript), Demo (Laravel), and Panel (Rust)

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

# Array to store process IDs
PIDS=()

# Cleanup function to kill all background processes
cleanup() {
    echo -e "\n${YELLOW}🛑 Stopping all services...${NC}"
    
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${CYAN}Killing process $pid${NC}"
            kill "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait a bit for graceful shutdown
    sleep 2
    
    # Force kill if still running
    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${RED}Force killing process $pid${NC}"
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    
    echo -e "${GREEN}✅ All services stopped${NC}"
    exit 0
}

# Trap signals to cleanup
trap cleanup SIGINT SIGTERM

echo -e "${GREEN}🚀 Starting development environment...${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Start Backend (Go with Air for live reload)
echo -e "${BLUE}[BACKEND]${NC} Starting Go server with Air (live reload)..."
(
    cd backend
    air
) | sed 's/^/[BACKEND] /' &
PIDS+=($!)

# Start Dashboard (Next.js)
echo -e "${BLUE}[DASHBOARD]${NC} Starting Next.js dev server..."
(
    cd dashboard
    npm run dev
) | sed 's/^/[DASHBOARD] /' &
PIDS+=($!)

# Start Tracker (TypeScript watch mode)
echo -e "${BLUE}[TRACKER]${NC} Starting Rollup watch mode..."
(
    cd tracker
    npm run dev
) | sed 's/^/[TRACKER] /' &
PIDS+=($!)

# Start Demo (Laravel)
echo -e "${BLUE}[DEMO]${NC} Starting Laravel app..."
(
    cd demo/blog
    php artisan serve
) | sed 's/^/[DEMO] /' &
PIDS+=($!)

# Start Panel (Rust with cargo-watch for hot reload)
echo -e "${BLUE}[PANEL]${NC} Starting Rust panel with cargo-watch (hot reload)..."
(
    cd panel
    ./dev.sh
) | sed 's/^/[PANEL] /' &
PIDS+=($!)

echo ""
echo -e "${GREEN}✅ All services started!${NC}"
echo -e "${CYAN}========================================${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for all background processes
wait

