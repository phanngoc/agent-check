# Setup Guide

Complete setup instructions for the User Behavior Tracking System.

## Prerequisites

- **Docker** and **Docker Compose** (for database)
- **Node.js 18+** (for tracker & dashboard)
- **Go 1.21+** (for backend API)

## Step-by-Step Setup

### 1. Start the Database

```bash
# Start TimescaleDB
docker-compose up -d

# Verify database is running
docker-compose ps

# Check logs
docker-compose logs timescaledb
```

The database will automatically initialize with the schema from `database/init.sql`.

**Database Access:**
- Host: `localhost:5432`
- Database: `tracker`
- Username: `tracker`
- Password: `tracker`

**Optional PgAdmin:**
```bash
docker-compose --profile tools up -d pgadmin
# Access at http://localhost:5050
# Email: admin@tracker.local
# Password: admin
```

### 2. Build the Tracking Script

```bash
cd tracker

# Install dependencies
npm install

# Build the tracker script
npm run build

# This creates dist/tracker.js and dist/tracker.min.js
```

### 3. Start the Backend API

```bash
cd backend

# Install Go dependencies
go mod download

# Copy environment file
cp .env.example .env

# Run the server
go run cmd/server/main.go
```

The API will start on `http://localhost:8080`.

**API Endpoints:**
- Health: `http://localhost:8080/health`
- Sessions: `http://localhost:8080/api/v1/sessions`
- Tracking: `http://localhost:8080/api/v1/track`

### 4. Start the Admin Dashboard

```bash
cd dashboard

# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local

# Start development server
npm run dev
```

The dashboard will be available at `http://localhost:3000`.

### 5. Test with Demo Website

```bash
# Serve the demo website (any simple HTTP server)
cd demo

# Option 1: Using Python
python3 -m http.server 8000

# Option 2: Using Node.js (npx http-server)
npx http-server -p 8000

# Option 3: Using PHP
php -S localhost:8000
```

Open `http://localhost:8000` in your browser.

## Verification

### 1. Check Database Connection

```bash
# Connect to database
docker exec -it tracker-db psql -U tracker -d tracker

# Run queries
\dt  # List tables
SELECT COUNT(*) FROM sessions;
SELECT COUNT(*) FROM events;
\q   # Quit
```

### 2. Test API Health

```bash
curl http://localhost:8080/health
# Should return: {"status":"healthy"}
```

### 3. Test Tracking

1. Open demo website at `http://localhost:8000`
2. Click buttons, fill forms, scroll
3. Check browser console for tracking logs
4. Open dashboard at `http://localhost:3000`
5. You should see your session appear in the list

### 4. Watch Session Replay

1. In the dashboard, click "Watch Replay" on any session
2. Use playback controls to view the recorded session
3. See timeline of all events on the right
4. Screenshots should appear as you replay

## Troubleshooting

### Database Connection Issues

```bash
# Restart database
docker-compose restart timescaledb

# Check logs
docker-compose logs timescaledb

# Recreate database
docker-compose down -v
docker-compose up -d
```

### Backend API Issues

```bash
# Check if port 8080 is in use
lsof -i :8080

# View Go build errors
go build ./cmd/server

# Run with verbose logging
LOG_LEVEL=debug go run cmd/server/main.go
```

### Tracker Build Issues

```bash
cd tracker

# Clean build
rm -rf node_modules dist
npm install
npm run build

# Check output
ls -lh dist/
```

### Dashboard Issues

```bash
cd dashboard

# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
npm install

# Check API connection
curl http://localhost:8080/api/v1/sessions
```

### CORS Issues

If you get CORS errors in the browser:

1. Check `backend/.env` - make sure CORS_ORIGINS includes your frontend URL
2. Restart backend after changing `.env`
3. Clear browser cache

```env
# backend/.env
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

## Production Deployment

### Environment Variables

**Backend:**
```env
PORT=8080
HOST=0.0.0.0
DATABASE_URL=postgres://user:pass@host:5432/dbname
CORS_ORIGINS=https://yourdomain.com
```

**Dashboard:**
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

### Build for Production

```bash
# Tracker
cd tracker
npm run build
# Use dist/tracker.min.js in production

# Backend
cd backend
go build -o server cmd/server/main.go
./server

# Dashboard
cd dashboard
npm run build
npm start
```

### Docker Deployment

```bash
# Build all services
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d
```

## Performance Tuning

### Database

```sql
-- Adjust retention policy (keep 60 days instead of 30)
SELECT remove_retention_policy('events');
SELECT add_retention_policy('events', INTERVAL '60 days');

-- Adjust compression (compress after 3 days instead of 7)
SELECT remove_compression_policy('events');
SELECT add_compression_policy('events', INTERVAL '3 days');
```

### Backend

```env
# Increase connection pool
DATABASE_MAX_CONNS=50
DATABASE_MIN_CONNS=10

# Adjust rate limiting
RATE_LIMIT_REQUESTS=200
RATE_LIMIT_DURATION=60
```

### Tracker

```javascript
window.UserTracker.init({
  // Reduce mouse move tracking
  mouseMoveThrottle: 200, // 200ms instead of 100ms

  // Increase batch size
  batchSize: 100, // 100 instead of 50

  // Longer flush interval
  flushInterval: 10000, // 10 seconds

  // Lower screenshot quality
  screenshotQuality: 0.6, // 60% instead of 80%
});
```

## Monitoring

### Database Size

```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size('tracker'));

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### API Metrics

```bash
# Monitor API logs
tail -f logs/api.log

# Check active sessions
curl http://localhost:8080/api/v1/sessions | jq '.total'
```

## Security Notes

1. **Change default passwords** in production
2. **Use HTTPS** for all communications
3. **Implement authentication** for admin dashboard
4. **Set up firewall rules** to restrict database access
5. **Regular backups** of TimescaleDB
6. **Monitor for suspicious activity**
7. **Implement rate limiting** on tracking endpoints
8. **Sanitize all inputs** to prevent injection attacks

## Support

For issues or questions:
- Check GitHub Issues: https://github.com/your-repo/issues
- Read the main README.md
- Review API documentation
