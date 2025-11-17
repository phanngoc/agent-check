#!/bin/bash

# User Behavior Tracking System - Quick Start Script
# This script helps you start all components of the system

set -e

echo "🚀 User Behavior Tracking System - Quick Start"
echo "=============================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

if ! command -v go &> /dev/null; then
    echo -e "${RED}❌ Go is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All prerequisites found${NC}"
echo ""

# Start database
echo "🗄️  Starting TimescaleDB..."
docker-compose up -d
sleep 5

if docker-compose ps | grep -q "Up"; then
    echo -e "${GREEN}✅ Database is running${NC}"
else
    echo -e "${RED}❌ Failed to start database${NC}"
    exit 1
fi
echo ""

# Build tracker
echo "📦 Building tracking script..."
cd tracker
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install
fi
npm run build
if [ -f "dist/tracker.js" ]; then
    echo -e "${GREEN}✅ Tracker built successfully${NC}"
else
    echo -e "${RED}❌ Failed to build tracker${NC}"
    exit 1
fi
cd ..
echo ""

# Setup backend
echo "🔧 Setting up backend..."
cd backend
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  Created .env file"
fi
go mod download
echo -e "${GREEN}✅ Backend ready${NC}"
cd ..
echo ""

# Setup dashboard
echo "🎨 Setting up dashboard..."
cd dashboard
if [ ! -d "node_modules" ]; then
    echo "  Installing dependencies..."
    npm install
fi
if [ ! -f ".env.local" ]; then
    echo "NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1" > .env.local
    echo "  Created .env.local file"
fi
echo -e "${GREEN}✅ Dashboard ready${NC}"
cd ..
echo ""

echo "=============================================="
echo -e "${GREEN}✨ Setup complete!${NC}"
echo ""
echo "To start the system, run these commands in separate terminals:"
echo ""
echo -e "${YELLOW}Terminal 1 - Backend API:${NC}"
echo "  cd backend && go run cmd/server/main.go"
echo ""
echo -e "${YELLOW}Terminal 2 - Dashboard:${NC}"
echo "  cd dashboard && npm run dev"
echo ""
echo -e "${YELLOW}Terminal 3 - Demo Website:${NC}"
echo "  cd demo && python3 -m http.server 8000"
echo ""
echo "Then open:"
echo "  🌐 Demo site: http://localhost:8000"
echo "  📊 Dashboard: http://localhost:3000"
echo "  🔌 API: http://localhost:8080/health"
echo ""
echo "For detailed instructions, see SETUP.md"
echo "=============================================="
