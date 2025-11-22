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
- ✅ SQLite database cho search và filtering logs
- ✅ Auto cleanup logs cũ

## Cài đặt

### Yêu cầu

- Rust 1.70+
- Docker (để quản lý containers)
- cargo-watch (cho development mode, optional)

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

## Frontend Development

Frontend được xây dựng với SolidJS + TypeScript + Tailwind CSS + shadcn-solid.

### Setup Frontend

```bash
cd panel
npm install
```

### Chạy Frontend Development Server

```bash
npm run dev
```

Frontend dev server sẽ chạy tại `http://localhost:5173` với proxy đến backend API tại `http://localhost:9000`.

### Build Frontend

```bash
npm run build
```

Build output sẽ được tạo trong `static/` directory.

## Backend Development

### Chạy Development Mode với Hot Reload

Sử dụng script `dev.sh` để chạy panel với auto-reload khi code thay đổi:

```bash
cd panel
./dev.sh
```

Script này sử dụng `cargo-watch` để tự động rebuild và restart khi có thay đổi trong `src/` directory.

**Lưu ý về Hot Reload Tools**:

Script `dev.sh` sẽ tự động cài đặt `cargo-watch` nếu chưa có. Nếu gặp lỗi, có thể:

1. **Cài thủ công với flags** (khuyến nghị cho Mac M1):
```bash
cargo install cargo-watch --no-default-features --features watchexec-notify
```

2. **Sử dụng watchexec thay thế**:
```bash
brew install watchexec
# Script sẽ tự động dùng watchexec nếu cargo-watch không có
```

3. **Chạy không hot reload**:
```bash
cd panel
cargo run
# Tự restart khi cần
```

**Lưu ý**: `cargo-watch` đã deprecated trên Homebrew, nên cài từ crates.io thay vì Homebrew.

### Chạy Development Mode thủ công

Nếu không muốn dùng `cargo-watch`, có thể chạy thủ công:

```bash
cd panel
cargo run
```

Hoặc sử dụng `cargo watch` trực tiếp (nếu đã cài):
```bash
cd panel
cargo watch -x 'run' -w src -d 0.2 -c
```

### Các lệnh hữu ích cho Development

```bash
# Check code (không compile)
cargo check

# Build release
cargo build --release

# Run tests (nếu có)
cargo test

# Format code
cargo fmt

# Lint code
cargo clippy
```

### Database Development

SQLite database được lưu tại `panel/data/logs.db`. Có thể sử dụng SQLite CLI để query:

```bash
# Xem schema
sqlite3 panel/data/logs.db ".schema"

# Query logs
sqlite3 panel/data/logs.db "SELECT * FROM logs LIMIT 10;"

# Xem thống kê
sqlite3 panel/data/logs.db "SELECT service_id, COUNT(*) FROM logs GROUP BY service_id;"
```

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

### Logs Management

- `POST /api/logs/cleanup?days=30` - Cleanup logs older than specified days (default: 30)
- `GET /api/logs/stats` - Get log statistics (total, by service, by level)

## Cấu trúc

```
panel/
├── src/                     # Rust backend source
│   ├── main.rs              # Entry point
│   ├── server.rs             # HTTP server & API
│   ├── process_manager.rs   # Process management
│   ├── docker_manager.rs    # Docker management
│   ├── service_detector.rs  # Auto-detect services
│   ├── log_manager.rs       # Log management
│   ├── database.rs          # SQLite database for logs
│   ├── metrics.rs           # Metrics collection
│   ├── config.rs            # Configuration
│   └── models.rs            # Data models
├── src/                     # Frontend source (SolidJS + TypeScript)
│   ├── main.tsx             # Entry point
│   ├── App.tsx              # Root component
│   ├── components/          # UI components
│   ├── pages/               # Page components
│   ├── stores/              # State management
│   ├── api/                 # API client
│   └── types/               # TypeScript types
├── static/                  # Web UI (build output)
│   ├── index.html
│   └── assets/              # Vite build assets
├── logs/                    # Log files (gitignored)
├── data/                    # SQLite database (gitignored)
│   └── logs.db
├── package.json             # Frontend dependencies
├── vite.config.ts           # Vite configuration
├── tailwind.config.js       # Tailwind CSS configuration
└── dev.sh                   # Development script with hot reload
```

## Configuration

Mặc định:
- Port: 9000
- Host: 0.0.0.0
- Auto-restart: true
- Max restart attempts: 5
- Logs directory: `panel/logs/`
- Data directory: `panel/data/` (SQLite database)
- Log retention: 30 days (tự động cleanup)

Có thể thay đổi trong `src/config.rs` hoặc thông qua environment variables (sẽ được thêm sau).

### Log Storage

Panel sử dụng dual storage cho logs:
- **File text** (`logs/*.log`): Cho realtime streaming qua SSE
- **SQLite database** (`data/logs.db`): Cho search và filtering hiệu quả

Logs mới được ghi vào cả hai nơi. Khi start lần đầu, logs cũ từ file sẽ được tự động migrate vào database (background task).

## Developer Experience

- Real-time updates qua SSE
- Color-coded logs
- Auto-refresh metrics mỗi 5 giây
- Responsive design
- Error handling và recovery
- Graceful shutdown

## License

MIT

