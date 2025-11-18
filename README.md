# User Behavior Tracking System

A comprehensive user session replay system for QA and debugging.

## Features

- 📹 **Session Replay**: Watch user interactions like a video
- 🖱️ **Complete Tracking**: Clicks, inputs, scrolls, mouse movements, navigation
- 📸 **Screenshots**: Full-page captures on every page change
- ⚡ **Real-time**: WebSocket support for live session monitoring
- 🔍 **Event Inspector**: Detailed timeline of all user actions
- 🎛️ **Playback Controls**: Speed control (0.5x-4x), pause, skip

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Website   │──────▶│   Tracker    │──────▶│  Backend    │
│  (Client)   │◀──────│  (tracker.js)│◀──────│   (Go API)  │
└─────────────┘      └──────────────┘      └─────────────┘
                                                     │
                                                     ▼
                                            ┌─────────────┐
                                            │ TimescaleDB │
                                            │ (Postgres)  │
                                            └─────────────┘
                                                     ▲
                                                     │
                                            ┌─────────────┐
                                            │  Dashboard  │
                                            │  (Next.js)  │
                                            └─────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for tracker & dashboard)
- Go 1.21+ (for backend)

### Setup

1. **Start TimescaleDB**:
   ```bash
   docker-compose up -d
   ```

2. **Build Tracker Script**:
   ```bash
   cd tracker
   npm install
   npm run build
   ```

3. **Start Backend API**:
   ```bash
   cd backend
   go mod download
   go run cmd/server/main.go
   ```

4. **Start Admin Dashboard**:
   ```bash
   cd dashboard
   npm install
   npm run dev
   ```

### Integration

Add the tracking script to your website:

```html
<script src="http://localhost:3000/tracker.js"></script>
<script>
  window.UserTracker.init({
    apiUrl: 'http://localhost:8080/api/v1',
    userId: 'optional-user-id',
    captureScreenshots: true,
    maskSensitiveInputs: true
  });
</script>
```

## Project Structure

```
.
├── tracker/              # Tracking script (TypeScript)
│   ├── src/
│   │   └── tracker.ts
│   ├── rollup.config.js
│   └── package.json
│
├── backend/              # API server (Go)
│   ├── cmd/
│   │   ├── server/
│   │   │   └── main.go
│   │   └── migrate/
│   │       └── main.go  # Migration CLI tool
│   ├── internal/
│   │   ├── handlers/     # HTTP handlers
│   │   ├── models/       # Database models
│   │   ├── repository/   # Data access layer
│   │   ├── middleware/   # CORS, auth, etc
│   │   └── migration/    # Migration helpers
│   ├── go.mod
│   └── .env
│
├── dashboard/            # Admin UI (Next.js)
│   ├── app/
│   │   ├── page.tsx      # Session list
│   │   └── sessions/[id]/page.tsx  # Replay player
│   ├── components/
│   │   ├── SessionList.tsx
│   │   ├── ReplayPlayer.tsx
│   │   └── EventTimeline.tsx
│   └── package.json
│
├── database/
│   ├── migrations/       # Database migration files
│   │   ├── 000001_initial_schema.up.sql
│   │   ├── 000001_initial_schema.down.sql
│   │   ├── 000002_fix_target_element_length.up.sql
│   │   └── 000002_fix_target_element_length.down.sql
│   └── init.sql         # Initial schema (for Docker)
│
└── docker-compose.yml
```

## API Endpoints

### Event Tracking
- `POST /api/v1/track` - Ingest events (batch)
- `POST /api/v1/track/screenshot` - Upload screenshot

### Session Management
- `GET /api/v1/sessions` - List sessions
- `GET /api/v1/sessions/:id` - Get session details
- `GET /api/v1/sessions/:id/events` - Get session events
- `WS /ws/sessions/:id` - Real-time session stream

## Configuration

### Environment Variables

**Backend** (`.env`):
```env
DATABASE_URL=postgres://tracker:tracker@localhost:5432/tracker
PORT=8080
CORS_ORIGINS=http://localhost:3000
AUTO_MIGRATE=false  # Set to true to auto-run migrations on startup
```

**Tracker** (init options):
```javascript
{
  apiUrl: 'http://localhost:8080/api/v1',
  userId: null,                    // Optional user identifier
  captureScreenshots: true,        // Enable screenshots
  screenshotQuality: 0.8,          // JPEG quality (0-1)
  maskSensitiveInputs: true,       // Auto-mask passwords
  batchSize: 50,                   // Events per batch
  flushInterval: 5000,             // ms between flushes
  mouseMoveThrottle: 100           // ms throttle for mouse
}
```

## Privacy & Security

- 🔒 **Input Masking**: Automatically masks password, credit card fields
- 🚫 **Opt-out**: Respect `data-tracker-ignore` attribute
- ⏱️ **Retention**: Configurable data retention policy (default: 30 days)
- 🛡️ **Rate Limiting**: Prevent abuse and DoS attacks

## Performance

- **Tracker**: <50KB gzipped, minimal CPU impact
- **Screenshots**: Compressed JPEG, async processing
- **Batching**: Events buffered and sent in batches
- **Debouncing**: Mouse movements throttled to 100ms

## Development

### Hot Reload

- **Backend**: Uses `air` for hot reloading
- **Dashboard**: Next.js dev server with fast refresh
- **Tracker**: Rollup watch mode

### Testing

```bash
# Backend tests
cd backend && go test ./...

# Dashboard tests
cd dashboard && npm test

# Integration test with demo site
cd demo && npm run dev
```

## License

MIT

## Contributing

Contributions welcome! Please read CONTRIBUTING.md for guidelines.
