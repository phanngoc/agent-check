# Ecommerce Site - NestJS + NextJS

Ecommerce site hoàn chỉnh với NestJS backend và NextJS frontend (Turbopack), tích hợp VNPay payment.

## Tính năng

- ✅ List sản phẩm với pagination
- ✅ Search sản phẩm
- ✅ Add sản phẩm vào giỏ hàng
- ✅ Quản lý giỏ hàng (thêm, sửa, xóa)
- ✅ Checkout với form giao hàng
- ✅ Authentication (Login/Register)
- ✅ User có thể add product vào cart trước, sau đó login/register để checkout
- ✅ Tích hợp VNPay payment
- ✅ Xem lịch sử đơn hàng
- ✅ Cart sync giữa localStorage và backend

## Cấu trúc Project

```
sites/ecommerce/
├── backend/          # NestJS API
│   ├── src/
│   │   ├── auth/     # Authentication module
│   │   ├── products/ # Products module
│   │   ├── cart/     # Cart module
│   │   ├── orders/   # Orders module
│   │   ├── payment/  # VNPay payment module
│   │   └── users/    # Users module
│   └── prisma/       # Prisma schema và seed
│
└── frontend/         # NextJS app với Turbopack
    ├── app/          # Pages và routes
    ├── components/   # React components
    └── lib/          # Utilities và stores
```

## Setup

### Backend

1. **Cài đặt dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Cấu hình database:**
   - Tạo MySQL database
   - Tạo file `.env` từ `.env.example`:
     ```env
     DATABASE_URL="mysql://user:password@localhost:3306/ecommerce"
     JWT_SECRET="your-secret-key"
     JWT_EXPIRES_IN="7d"
     VNPAY_TMN_CODE="your-tmn-code"
     VNPAY_SECRET_KEY="your-secret-key"
     VNPAY_URL="https://sandbox.vnpayment.vn/paymentv2/vpcpay.html"
     VNPAY_RETURN_URL="http://localhost:3000/payment/callback"
     PORT=3001
     ```

3. **Chạy migrations và seed:**
   ```bash
   npx prisma generate
   npx prisma migrate dev
   npm run prisma:seed
   ```

4. **Start server:**
   ```bash
   npm run start:dev
   ```

### Frontend

1. **Cài đặt dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Cấu hình environment:**
   - Tạo file `.env.local`:
     ```env
     NEXT_PUBLIC_API_URL=http://localhost:3001
     NEXT_PUBLIC_VNPAY_RETURN_URL=http://localhost:3000/payment/callback
     ```

3. **Start dev server:**
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /auth/register` - Đăng ký
- `POST /auth/login` - Đăng nhập

### Products
- `GET /products` - List products (với pagination và search)
- `GET /products/search?q=...` - Search products
- `GET /products/:id` - Product detail

### Cart (Protected)
- `GET /cart` - Get user cart
- `POST /cart` - Add item to cart
- `PUT /cart/:id` - Update cart item quantity
- `DELETE /cart/:id` - Remove item from cart

### Orders (Protected)
- `POST /orders` - Create order from cart
- `GET /orders` - Get user orders
- `GET /orders/:id` - Get order detail

### Payment
- `POST /payment/create` - Create VNPay payment URL
- `GET /payment/callback` - Handle VNPay callback

## Database Schema

- **User**: id, email, password, name
- **Product**: id, name, description, price, image, stock, category
- **CartItem**: id, userId, productId, quantity
- **Order**: id, userId, total, status, shippingAddress
- **OrderItem**: id, orderId, productId, quantity, price
- **Payment**: id, orderId, amount, paymentMethod, status, transactionId

## Testing Flow

1. User vào trang chủ, xem danh sách sản phẩm
2. Search sản phẩm
3. Add sản phẩm vào cart (có thể nhiều sản phẩm)
4. Click checkout → Redirect đến login/register nếu chưa đăng nhập
5. Sau khi login/register → Redirect về checkout
6. Điền thông tin shipping
7. Click "Thanh toán" → Redirect đến VNPay
8. Thanh toán xong → VNPay redirect về callback
9. Hiển thị kết quả và update order status

## Default User

Sau khi chạy seed:
- Email: `test@example.com`
- Password: `password123`

## Notes

- Frontend sử dụng Turbopack cho development (faster builds)
- Cart được sync giữa localStorage và backend khi user login
- VNPay integration sử dụng sandbox environment (cần config credentials)
- Responsive design với TailwindCSS

