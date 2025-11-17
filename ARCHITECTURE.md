# System Architecture

Detailed architecture documentation for the User Behavior Tracking System.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Browser                          │
│  ┌──────────────┐                      ┌──────────────────┐    │
│  │   Website    │◄────────────────────►│  Tracker.js      │    │
│  │  (Client)    │                      │  (Injected)      │    │
│  └──────────────┘                      └─────────┬────────┘    │
└────────────────────────────────────────────────────┼────────────┘
                                                     │
                                    HTTPS POST       │
                           (Batched Events/Screenshots)
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend API (Go + Fiber)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │  Middleware  │  │   Handlers   │  │   Repositories   │     │
│  │  - CORS      │→ │  - Sessions  │→ │  - Session Repo  │     │
│  │  - Logger    │  │  - Events    │  │  - Event Repo    │     │
│  │  - RateLmt   │  │  - Screenshots│  │  - Screenshot    │     │
│  └──────────────┘  └──────────────┘  └─────────┬────────┘     │
└──────────────────────────────────────────────────┼──────────────┘
                                                    │
                                         pgx v5     │ Connection Pool
                                                    │ (5-25 conns)
                                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│            TimescaleDB (PostgreSQL 15 + Extension)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│  │  sessions    │  │   events     │  │  screenshots     │     │
│  │  (metadata)  │  │ (hypertable) │  │  (blob storage)  │     │
│  └──────────────┘  └──────────────┘  └──────────────────┘     │
│                                                                  │
│  Features:                                                       │
│  • Hypertable: 1-day chunks                                    │
│  • Compression: After 7 days                                   │
│  • Retention: Delete after 30 days                             │
│  • Continuous Aggregates: Hourly stats                         │
└─────────────────────────────────────────────────────────────────┘
                                                    ▲
                                         REST API   │
                                                    │
┌─────────────────────────────────────────────────────────────────┐
│              Admin Dashboard (Next.js 14 + React)               │
│  ┌──────────────┐                      ┌──────────────────┐    │
│  │ Session List │                      │  Replay Player   │    │
│  │  - Filter    │────────────────────► │  - Timeline      │    │
│  │  - Paginate  │                      │  - Screenshots   │    │
│  │  - Sort      │                      │  - Controls      │    │
│  └──────────────┘                      └──────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interactions

### 1. Event Capture Flow

```
User Action (Click/Type/Scroll)
         │
         ▼
JavaScript Event Listener
         │
         ▼
Event Data Builder
  • Extract element info
  • Get coordinates
  • Mask sensitive data
  • Add timestamp
         │
         ▼
Event Queue (Array)
  • Batch events
  • Max 50 events
         │
         ▼
Flush Trigger
  • Queue full (50 events)
  • Timer (5 seconds)
  • Page unload
         │
         ▼
HTTP POST to /api/v1/track
  • JSON payload
  • Session ID
  • Event array
         │
         ▼
Backend Handler
  • Validate payload
  • Parse session ID
  • Batch insert
         │
         ▼
Database (events table)
  • Insert 50 rows
  • Update session
  • Trigger: update last_activity
```

### 2. Screenshot Capture Flow

```
Page Navigation Event
         │
         ▼
html2canvas Library
  • Render DOM to canvas
  • Full page capture
  • 1-2 seconds
         │
         ▼
Canvas to JPEG
  • Quality: 80%
  • Base64 encode
  • Size: 100-500KB
         │
         ▼
HTTP POST to /api/v1/track/screenshot
  • Data URL format
  • Session ID
  • Timestamp
  • Page URL
         │
         ▼
Backend Handler
  • Decode base64
  • Validate size (<10MB)
  • Extract format
         │
         ▼
Database (screenshots table)
  • Store BYTEA
  • Index by session_id
  • Index by timestamp
```

### 3. Session Replay Flow

```
User Opens Dashboard
         │
         ▼
Load Session List (GET /api/v1/sessions)
  • Paginated (20/page)
  • Sorted by date DESC
  • Include summary stats
         │
         ▼
User Clicks "Watch Replay"
         │
         ▼
Parallel Requests:
  ├─► GET /api/v1/sessions/:id
  │     • Session metadata
  │
  ├─► GET /api/v1/sessions/:id/events
  │     • All events (limit 10000)
  │     • Ordered by timestamp ASC
  │
  └─► GET /api/v1/sessions/:id/screenshots
        • All screenshots with data
        • Base64 encoded
         │
         ▼
Initialize Replay Player
  • Sort events by timestamp
  • Map screenshots to timeline
  • Set current index to 0
         │
         ▼
User Clicks "Play"
         │
         ▼
Playback Loop:
  • Calculate time delta
  • Adjust for playback speed
  • setTimeout for next event
  • Update current index
  • Render screenshot
  • Highlight event in timeline
```

## Data Flow Diagrams

### Write Path (Tracking)

```
Browser → Tracker → Backend → Database
   1ms      5s        50ms      10ms

Total Latency: ~60ms (excluding batch delay)
```

### Read Path (Replay)

```
Dashboard → Backend → Database → Dashboard
   100ms      50ms      100ms     50ms

Total Latency: ~300ms for full session load
```

## Database Schema Details

### sessions Table
```sql
CREATE TABLE sessions (
  session_id UUID PRIMARY KEY,
  user_id VARCHAR(255),           -- Optional user identifier
  fingerprint VARCHAR(255),        -- Device fingerprint
  started_at TIMESTAMPTZ,          -- Session start
  ended_at TIMESTAMPTZ,            -- Session end (nullable)
  last_activity_at TIMESTAMPTZ,   -- Last event time
  page_url TEXT,                   -- Initial page
  referrer TEXT,                   -- HTTP referrer
  user_agent TEXT,                 -- Browser UA string
  screen_width INTEGER,            -- Screen dimensions
  screen_height INTEGER,
  viewport_width INTEGER,          -- Viewport size
  viewport_height INTEGER,
  device_type VARCHAR(50),         -- desktop/mobile/tablet
  browser VARCHAR(100),            -- Chrome/Firefox/Safari
  os VARCHAR(100),                 -- Windows/macOS/Linux
  metadata JSONB                   -- Additional data
);

Indexes:
  • PRIMARY KEY (session_id)
  • INDEX (user_id)
  • INDEX (started_at DESC)
  • INDEX (fingerprint)
```

### events Table (Hypertable)
```sql
CREATE TABLE events (
  event_id BIGSERIAL,
  session_id UUID,                 -- FK to sessions
  timestamp TIMESTAMPTZ,           -- Event time (partition key)
  event_type VARCHAR(50),          -- click/input/scroll/etc
  target_element VARCHAR(255),     -- HTML outerHTML (truncated)
  target_selector TEXT,            -- CSS selector
  target_tag VARCHAR(50),          -- HTML tag name
  target_id VARCHAR(255),          -- Element ID
  target_class TEXT,               -- Element classes
  page_url TEXT,                   -- Current page URL
  viewport_x INTEGER,              -- Click/mouse X
  viewport_y INTEGER,              -- Click/mouse Y
  screen_x INTEGER,                -- Screen X
  screen_y INTEGER,                -- Screen Y
  scroll_x INTEGER,                -- Scroll X position
  scroll_y INTEGER,                -- Scroll Y position
  input_value TEXT,                -- Input text
  input_masked BOOLEAN,            -- Is value masked?
  key_pressed VARCHAR(50),         -- Key name
  mouse_button INTEGER,            -- Mouse button (0=left)
  click_count INTEGER,             -- Click count
  event_data JSONB,                -- Additional data
  PRIMARY KEY (timestamp, event_id)
);

SELECT create_hypertable('events', 'timestamp',
  chunk_time_interval => INTERVAL '1 day');

Indexes:
  • PRIMARY KEY (timestamp, event_id)
  • INDEX (session_id, timestamp DESC)
  • INDEX (event_type, timestamp DESC)
  • INDEX (page_url)
```

### screenshots Table
```sql
CREATE TABLE screenshots (
  screenshot_id BIGSERIAL PRIMARY KEY,
  session_id UUID,                 -- FK to sessions
  page_url TEXT,                   -- Page URL
  timestamp TIMESTAMPTZ,           -- Capture time
  image_data BYTEA,                -- Binary image data
  image_format VARCHAR(10),        -- jpeg/png
  image_width INTEGER,             -- Image dimensions
  image_height INTEGER,
  file_size INTEGER                -- Bytes
);

Indexes:
  • PRIMARY KEY (screenshot_id)
  • INDEX (session_id, timestamp)
  • INDEX (timestamp DESC)
```

## API Endpoints Reference

### Session Management

**POST /api/v1/sessions**
Create new session
```json
Request:
{
  "user_id": "user-123",
  "page_url": "https://example.com",
  "user_agent": "Mozilla/5.0...",
  "device_type": "desktop",
  "browser": "Chrome",
  "os": "Windows"
}

Response: 201 Created
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "started_at": "2024-01-01T12:00:00Z"
}
```

**GET /api/v1/sessions**
List sessions (paginated)
```
Query Params:
  ?limit=20&offset=0

Response: 200 OK
{
  "data": [...],
  "total": 1000,
  "limit": 20,
  "offset": 0
}
```

**GET /api/v1/sessions/:id**
Get session details
```
Response: 200 OK
{
  "session_id": "...",
  "user_id": "...",
  "started_at": "...",
  ...
}
```

**GET /api/v1/sessions/:id/events**
Get session events
```
Query Params:
  ?limit=1000

Response: 200 OK
{
  "data": [...],
  "total": 523
}
```

### Event Tracking

**POST /api/v1/track**
Track events (batch)
```json
Request:
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "events": [
    {
      "timestamp": "2024-01-01T12:00:00Z",
      "event_type": "click",
      "page_url": "https://example.com",
      "target_selector": "button#submit",
      "viewport_x": 100,
      "viewport_y": 200
    },
    ...
  ]
}

Response: 201 Created
{
  "message": "Events tracked successfully",
  "count": 50
}
```

**POST /api/v1/track/screenshot**
Upload screenshot
```json
Request:
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "page_url": "https://example.com",
  "timestamp": "2024-01-01T12:00:00Z",
  "image_data": "data:image/jpeg;base64,/9j/4AAQ...",
  "width": 1920,
  "height": 1080
}

Response: 201 Created
{
  "message": "Screenshot uploaded successfully",
  "screenshot_id": 123
}
```

## Performance Optimization

### Database Optimizations

**Partitioning**
- Events table partitioned by time (1-day chunks)
- Enables fast time-range queries
- Automatic partition management

**Compression**
- Compress chunks older than 7 days
- 50-70% storage reduction
- Minimal query performance impact

**Retention**
- Auto-delete data older than 30 days
- Configurable per deployment
- Reduces storage costs

**Indexing Strategy**
```sql
-- Session lookup
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Time-range queries
CREATE INDEX idx_events_timestamp ON events(timestamp DESC);

-- Event filtering
CREATE INDEX idx_events_type ON events(event_type, timestamp DESC);

-- Session events
CREATE INDEX idx_events_session ON events(session_id, timestamp DESC);
```

### Backend Optimizations

**Connection Pooling**
```go
config.MaxConns = 25  // Maximum connections
config.MinConns = 5   // Minimum kept open
```

**Batch Processing**
```go
// Insert events in single transaction
batch := &pgx.Batch{}
for _, event := range events {
  batch.Queue(insertQuery, event...)
}
conn.SendBatch(ctx, batch)
```

**Request Timeout**
```go
ReadTimeout:  10 * time.Second
WriteTimeout: 10 * time.Second
```

### Frontend Optimizations

**Event Batching**
```typescript
// Queue events, flush when:
// 1. Queue reaches 50 events
// 2. 5 seconds elapsed
// 3. Page unload
```

**Mouse Move Throttling**
```typescript
// Only capture every 100ms
if (now - lastMouseMove < 100) return;
```

**Screenshot Optimization**
```typescript
// JPEG compression at 80% quality
canvas.toDataURL('image/jpeg', 0.8)
```

## Security Measures

### Input Validation
```go
// Validate session ID format
sessionID, err := uuid.Parse(req.SessionID)

// Validate required fields
if req.PageURL == "" {
  return error
}

// Limit batch size
if len(req.Events) > 100 {
  return error
}
```

### Rate Limiting
```go
// 100 requests per 60 seconds per IP
limiter.New(limiter.Config{
  Max:        100,
  Expiration: 60 * time.Second,
})
```

### CORS Protection
```go
// Only allow specific origins
CORS(origins string) {
  AllowOrigins: "http://localhost:3000,https://yourdomain.com"
}
```

### Data Sanitization
```typescript
// Mask sensitive inputs
const sensitiveTypes = ['password', 'email', 'tel'];
const sensitivePatterns = ['password', 'credit', 'card', 'cvv'];

if (isSensitive(input)) {
  inputValue = '***MASKED***';
  inputMasked = true;
}
```

## Monitoring & Observability

### Health Checks
```bash
curl http://localhost:8080/health
# Response: {"status":"healthy"}
```

### Logging
```
[2024-01-01T12:00:00Z] 200 - 45ms POST /api/v1/track
[2024-01-01T12:00:01Z] 201 - 123ms POST /api/v1/track/screenshot
```

### Metrics to Monitor
- Request latency (p50, p95, p99)
- Error rate
- Database connection pool utilization
- Disk usage (screenshots)
- Memory usage
- Event ingestion rate

### Database Monitoring
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Database size
SELECT pg_size_pretty(pg_database_size('tracker'));

-- Table sizes
SELECT pg_size_pretty(pg_total_relation_size('events'));

-- Chunk info
SELECT * FROM timescaledb_information.chunks;
```

## Deployment Architecture

### Single Server (Development)
```
Server (localhost)
├── TimescaleDB (Docker, port 5432)
├── Backend API (Go, port 8080)
├── Dashboard (Next.js, port 3000)
└── Demo Site (HTTP server, port 8000)
```

### Production (Recommended)
```
Load Balancer
├── Backend API (Multiple instances)
│   └── TimescaleDB (Managed service)
│
├── Dashboard (Static hosting)
│   └── CDN
│
└── Tracker.js (CDN)
```

## Scaling Considerations

### Horizontal Scaling
- Backend API: Scale to multiple instances
- Load balancer: Distribute requests
- Database: Read replicas for queries

### Vertical Scaling
- Database: Increase memory/CPU
- Connection pool: Increase max connections
- Chunk size: Adjust for workload

### Cost Optimization
- Adjust retention policy
- Increase compression age
- Reduce screenshot quality
- Limit screenshot capture
