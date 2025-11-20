# Process Manager Panel

Panel quản lý process bằng Rust tương tự PM2, với Web UI để quản lý tất cả services của dự án.

## Tính năng

- ✅ Tự động phát hiện services từ cấu trúc thư mục
- ✅ Quản lý processes (start/stop/restart)
- ✅ Auto-restart khi crash
- ✅ Quản lý Docker containers
- ✅ Xem logs realtime qua SSE
- ✅ Metrics (CPU, RAM, uptime)
- ✅ Web UI hiện đại và responsive
- ✅ Lưu lịch sử logs

## Cài đặt

### Yêu cầu

- Rust 1.70+
- Docker (để quản lý containers)

### Build

```bash
cd panel
cargo build --release
```

## Sử dụng

### Chạy từ thư mục panel

```bash
cd panel
cargo run
```

Panel sẽ chạy tại `http://localhost:9000`

### Chạy từ project root

```bash
cd panel
cargo run
```

Panel sẽ tự động phát hiện project root và các services.

## Services được phát hiện tự động

- **Backend (Go)**: `backend/` với `go.mod` và `.air.toml`
- **Dashboard (Next.js)**: `dashboard/` với `package.json`
- **Tracker (TypeScript)**: `tracker/` với `package.json`
- **Demo (Laravel)**: `demo/blog/` với `artisan`

## Docker Containers

Panel tự động phát hiện containers từ `docker-compose.yml`:
- timescaledb
- mysql
- redis

## API Endpoints

### Services

- `GET /api/services` - List all services
- `POST /api/services/:id/start` - Start service
- `POST /api/services/:id/stop` - Stop service
- `POST /api/services/:id/restart` - Restart service
- `GET /api/services/:id/status` - Get service status
- `GET /api/services/:id/logs` - Get logs (query: `?lines=100`)
- `GET /api/services/:id/logs/stream` - Stream logs (SSE)
- `GET /api/services/:id/metrics` - Get metrics

### Containers

- `GET /api/containers` - List all containers
- `POST /api/containers/:id/start` - Start container
- `POST /api/containers/:id/stop` - Stop container
- `POST /api/containers/:id/restart` - Restart container
- `GET /api/containers/:id/logs` - Get container logs (query: `?tail=100`)

### System

- `GET /api/system/metrics` - Get system metrics

## Cấu trúc

```
panel/
├── src/
│   ├── main.rs              # Entry point
│   ├── server.rs             # HTTP server & API
│   ├── process_manager.rs   # Process management
│   ├── docker_manager.rs    # Docker management
│   ├── service_detector.rs  # Auto-detect services
│   ├── log_manager.rs       # Log management
│   ├── metrics.rs           # Metrics collection
│   ├── config.rs            # Configuration
│   └── models.rs            # Data models
├── static/                  # Web UI
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── logs/                    # Log files (gitignored)
```

## Configuration

Mặc định:
- Port: 9000
- Host: 0.0.0.0
- Auto-restart: true
- Max restart attempts: 5

Có thể thay đổi trong `src/config.rs` hoặc thông qua environment variables (sẽ được thêm sau).

## Developer Experience

- Real-time updates qua SSE
- Color-coded logs
- Auto-refresh metrics mỗi 5 giây
- Responsive design
- Error handling và recovery
- Graceful shutdown

## License

MIT

