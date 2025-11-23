'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCartStore } from '@/lib/stores/cartStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { formatPrice } from '@/lib/utils';
import api from '@/lib/api';

const checkoutSchema = z.object({
  shippingAddress: z.string().min(10, 'Địa chỉ phải có ít nhất 10 ký tự'),
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

export default function CheckoutPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { items, getTotal, setItems } = useCartStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/checkout');
      return;
    }

    // Fetch latest cart from backend
    const fetchCart = async () => {
      try {
        const response = await api.get('/cart');
        setItems(response.data);
      } catch (error) {
        console.error('Failed to fetch cart:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCart();
  }, [isAuthenticated, router, setItems]);

  const onSubmit = async (data: CheckoutFormData) => {
    if (items.length === 0) {
      alert('Giỏ hàng trống');
      return;
    }

    setIsProcessing(true);

    try {
      // Create order
      const orderResponse = await api.post('/orders', {
        shippingAddress: data.shippingAddress,
      });

      const orderId = orderResponse.data.id;

      // Create payment
      const paymentResponse = await api.post('/payment/create', {
        orderId,
      });

      // Redirect to VNPay
      if (paymentResponse.data.paymentUrl) {
        window.location.href = paymentResponse.data.paymentUrl;
      }
    } catch (error: any) {
      console.error('Checkout failed:', error);
      alert(
        error.response?.data?.message || 'Không thể tạo đơn hàng. Vui lòng thử lại.',
      );
      setIsProcessing(false);
    }
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Đang tải...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <p className="text-gray-500 mb-4">Giỏ hàng trống</p>
        <button
          onClick={() => router.push('/')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Tiếp tục mua sắm
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Thanh toán</h1>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold mb-4">Thông tin giao hàng</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Địa chỉ giao hàng *
              </label>
              <textarea
                {...register('shippingAddress')}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nhập địa chỉ giao hàng đầy đủ"
              />
              {errors.shippingAddress && (
                <p className="text-red-500 text-sm mt-1">
                  {errors.shippingAddress.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Đang xử lý...' : 'Tiến hành thanh toán'}
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md h-fit">
          <h2 className="text-xl font-bold mb-4">Đơn hàng</h2>
          <div className="space-y-2 mb-4">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span>
                  {item.product.name} x {item.quantity}
                </span>
                <span>
                  {formatPrice(Number(item.product.price) * item.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <div className="flex justify-between font-bold text-lg">
              <span>Tổng cộng:</span>
              <span className="text-blue-600">{formatPrice(getTotal())}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

