# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites Check

```bash
docker --version    # ✅ Docker installed
node --version      # ✅ Node.js 18+
go version         # ✅ Go 1.21+
```

## One-Command Setup

```bash
./start.sh
```

This script will:
1. ✅ Start TimescaleDB
2. ✅ Build tracking script
3. ✅ Setup backend
4. ✅ Setup dashboard

## Start Services

Open **3 separate terminals**:

### Terminal 1: Backend API
```bash
cd backend
go run cmd/server/main.go
```
✅ Running on `http://localhost:8080`

### Terminal 2: Dashboard
```bash
cd dashboard
npm run dev
```
✅ Running on `http://localhost:3000`

### Terminal 3: Demo Site
```bash
cd demo
python3 -m http.server 8000
```
✅ Running on `http://localhost:8000`

## Test It Out

1. **Open Demo**: `http://localhost:8000`
2. **Interact**: Click buttons, fill forms, scroll
3. **View Dashboard**: `http://localhost:3000`
4. **Watch Replay**: Click "Watch Replay" on any session

## Verify Everything Works

### Check Database
```bash
docker exec -it tracker-db psql -U tracker -d tracker -c "SELECT COUNT(*) FROM sessions;"
```

### Check API
```bash
curl http://localhost:8080/health
# Should return: {"status":"healthy"}
```

### Check Events
```bash
curl http://localhost:8080/api/v1/sessions
# Should return list of sessions
```

## Integration Guide

### Add to Your Website

```html
<!-- Add before closing </body> tag -->
<script src="http://localhost:8080/tracker.js"></script>
<script>
  window.UserTracker.init({
    apiUrl: 'http://localhost:8080/api/v1',
    userId: 'your-user-id', // Optional
    captureScreenshots: true,
    maskSensitiveInputs: true,
    debug: true // Remove in production
  });
</script>
```

### Ignore Specific Elements

```html
<!-- This element won't be tracked -->
<input type="text" data-tracker-ignore>
```

## Common Issues

### Database won't start
```bash
docker-compose down -v
docker-compose up -d
```

### Backend connection error
Check `.env` file has correct DATABASE_URL:
```env
DATABASE_URL=postgres://tracker:tracker@localhost:5432/tracker?sslmode=disable
```

### CORS errors
Update `backend/.env`:
```env
CORS_ORIGINS=http://localhost:3000,http://localhost:8000,http://yoursite.com
```

### Tracker not loading
1. Build tracker: `cd tracker && npm run build`
2. Check `tracker/dist/tracker.js` exists
3. Verify path in HTML script tag

## Production Checklist

- [ ] Change default passwords
- [ ] Use HTTPS
- [ ] Set production environment variables
- [ ] Implement authentication for dashboard
- [ ] Configure backups
- [ ] Set up monitoring
- [ ] Review privacy policy
- [ ] Test with real traffic
- [ ] Configure data retention
- [ ] Set up alerts

## Next Steps

1. **Read FEATURES.md** - See complete feature list
2. **Read SETUP.md** - Detailed setup instructions
3. **Read CONTRIBUTING.md** - Contribution guidelines
4. **Customize tracker** - Adjust configuration
5. **Deploy to production** - Follow production guide

## Support

- 📖 Full documentation in README.md
- 🐛 Report issues on GitHub
- 💬 Questions? Check existing issues first

## Quick Commands

```bash
# Start everything
./start.sh

# Start database only
docker-compose up -d

# Stop database
docker-compose down

# View database logs
docker-compose logs -f timescaledb

# Rebuild tracker
cd tracker && npm run build

# Backend tests
cd backend && go test ./...

# Dashboard build
cd dashboard && npm run build

# Check API health
curl http://localhost:8080/health

# List sessions
curl http://localhost:8080/api/v1/sessions

# View database
docker exec -it tracker-db psql -U tracker -d tracker
```

## File Structure

```
agent-check/
├── backend/          # Go API (Port 8080)
├── tracker/          # JS library
├── dashboard/        # Next.js UI (Port 3000)
├── demo/            # Test site (Port 8000)
├── database/        # SQL schema
├── docker-compose.yml
└── start.sh         # Setup script
```

## Environment URLs

| Service | URL | Description |
|---------|-----|-------------|
| Demo Site | http://localhost:8000 | Test website |
| Dashboard | http://localhost:3000 | Admin interface |
| API | http://localhost:8080 | Backend API |
| API Health | http://localhost:8080/health | Health check |
| Database | localhost:5432 | PostgreSQL |
| PgAdmin | http://localhost:5050 | DB admin (optional) |

That's it! You're ready to track user behavior! 🎉
