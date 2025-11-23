# Blog Demo - User Tracking System

Blog Laravel demo để test hệ thống User Behavior Tracking.

## Yêu cầu

- PHP >= 8.1
- Composer
- MySQL 8.0+ (chạy trên port 3307)
- Node.js (để build tracker.js)

## Cài đặt

### 1. Cài đặt dependencies

```bash
composer install
```

### 2. Cấu hình môi trường

Copy file `.env.example` thành `.env`:

```bash
cp .env.example .env
```

Cập nhật các thông tin database trong file `.env`:

```env
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3307
DB_DATABASE=blog_demo
DB_USERNAME=root
DB_PASSWORD=
```

### 3. Tạo database

Tạo database MySQL:

```sql
CREATE DATABASE blog_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Chạy migrations và seeders

```bash
php artisan migrate
php artisan db:seed
```

### 5. Tạo symlink cho tracker.js

Symlink đã được tạo tự động, nhưng nếu cần tạo lại:

```bash
cd public
ln -sf ../../../tracker/dist tracker
```

### 6. Khởi động server

```bash
php artisan serve
```

Truy cập: http://localhost:8000

## Cấu trúc

```
demo/blog/
├── app/
│   ├── Http/Controllers/
│   │   └── PostController.php
│   └── Models/
│       └── Post.php
├── database/
│   ├── migrations/
│   │   └── create_posts_table.php
│   └── seeders/
│       └── PostSeeder.php
├── resources/
│   └── views/
│       ├── layouts/
│       │   └── app.blade.php (với tracker.js tích hợp)
│       └── posts/
│           ├── index.blade.php
│           └── show.blade.php
└── routes/
    └── web.php
```

## Tích hợp Tracker

Tracker.js đã được tích hợp vào layout chính (`resources/views/layouts/app.blade.php`). 

Cấu hình tracker:

```javascript
window.UserTracker.init({
    apiUrl: 'http://localhost:8080/api/v1',
    userId: null,
    captureScreenshots: true,
    screenshotQuality: 0.8,
    maskSensitiveInputs: true,
    batchSize: 20,
    flushInterval: 3000,
    mouseMoveThrottle: 100,
    debug: true
});
```

**Lưu ý**: Đảm bảo backend API đang chạy trên port 8080 trước khi test tracking.

## Routes

- `GET /` - Danh sách bài viết
- `GET /posts/{slug}` - Chi tiết bài viết

## Tính năng Demo

Blog này được thiết kế với nhiều element tương tác để demo tracking:

- **Buttons**: Like, Share, Bookmark, Comments
- **Forms**: Contact form, Comment form
- **Navigation**: Links giữa các trang
- **Scroll areas**: Khu vực scroll dài để test scroll tracking
- **Modals/Toasts**: Popup notifications

## Dữ liệu mẫu

Seeder đã tạo 15 bài viết mẫu về các chủ đề liên quan đến User Tracking.

## Troubleshooting

### Tracker.js không load

- Kiểm tra symlink trong `public/tracker` có tồn tại không
- Đảm bảo tracker đã được build: `cd ../../tracker && npm run build`

### Database connection error

- Kiểm tra MySQL đang chạy trên port 3307
- Kiểm tra thông tin database trong `.env`
- Đảm bảo database `blog_demo` đã được tạo

### Backend API không kết nối

- Đảm bảo backend Go đang chạy trên port 8080
- Kiểm tra CORS settings trong backend
- Xem console browser để debug

## License

MIT
