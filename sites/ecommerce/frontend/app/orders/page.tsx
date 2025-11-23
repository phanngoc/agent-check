'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/stores/authStore';
import { formatPrice } from '@/lib/utils';
import api from '@/lib/api';
import Link from 'next/link';

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  product: {
    id: string;
    name: string;
    image: string | null;
  };
}

interface Order {
  id: string;
  total: number;
  status: string;
  shippingAddress: string | null;
  createdAt: string;
  orderItems: OrderItem[];
  payment: {
    status: string;
  } | null;
}

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/orders');
      return;
    }

    fetchOrders();
  }, [isAuthenticated, router]);

  const fetchOrders = async () => {
    try {
      const response = await api.get('/orders');
      setOrders(response.data);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800';
      case 'PROCESSING':
        return 'bg-blue-100 text-blue-800';
      case 'SHIPPED':
        return 'bg-purple-100 text-purple-800';
      case 'DELIVERED':
        return 'bg-green-100 text-green-800';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      PENDING: 'Chờ xử lý',
      PROCESSING: 'Đang xử lý',
      SHIPPED: 'Đã giao hàng',
      DELIVERED: 'Đã nhận hàng',
      CANCELLED: 'Đã hủy',
    };
    return statusMap[status] || status;
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Đơn hàng của tôi</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg mb-4">Bạn chưa có đơn hàng nào</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Tiếp tục mua sắm
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white p-6 rounded-lg shadow-md"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-semibold text-lg">
                    Đơn hàng #{order.id.slice(0, 8)}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleString('vi-VN')}
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(
                    order.status,
                  )}`}
                >
                  {getStatusText(order.status)}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                {order.orderItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 p-2 bg-gray-50 rounded"
                  >
                    {item.product.image && (
                      <img
                        src={item.product.image}
                        alt={item.product.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-medium">{item.product.name}</p>
                      <p className="text-sm text-gray-500">
                        Số lượng: {item.quantity} x {formatPrice(Number(item.price))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {order.shippingAddress && (
                <div className="mb-4">
                  <p className="text-sm text-gray-600">
                    <strong>Địa chỉ giao hàng:</strong> {order.shippingAddress}
                  </p>
                </div>
              )}

              <div className="flex justify-between items-center border-t pt-4">
                <div>
                  <p className="text-sm text-gray-600">Trạng thái thanh toán:</p>
                  <p
                    className={`font-medium ${
                      order.payment?.status === 'COMPLETED'
                        ? 'text-green-600'
                        : 'text-yellow-600'
                    }`}
                  >
                    {order.payment?.status === 'COMPLETED'
                      ? 'Đã thanh toán'
                      : 'Chưa thanh toán'}
                  </p>
                </div>
                <p className="text-xl font-bold text-blue-600">
                  {formatPrice(Number(order.total))}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

