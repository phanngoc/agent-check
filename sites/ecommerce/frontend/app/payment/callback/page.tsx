'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle } from 'lucide-react';
import api from '@/lib/api';
import Link from 'next/link';

export default function PaymentCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>(
    'loading',
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get all query parameters
        const params: Record<string, string> = {};
        searchParams.forEach((value, key) => {
          params[key] = value;
        });

        const response = await api.get('/payment/callback', { params });

        if (response.data.success) {
          setStatus('success');
          setMessage('Thanh toán thành công! Đơn hàng của bạn đã được xử lý.');

          // Clear cart
          if (typeof window !== 'undefined') {
            localStorage.removeItem('cart-storage');
          }
        } else {
          setStatus('failed');
          setMessage('Thanh toán thất bại. Vui lòng thử lại.');
        }
      } catch (error: any) {
        console.error('Payment callback error:', error);
        setStatus('failed');
        setMessage(
          error.response?.data?.message ||
            'Có lỗi xảy ra khi xử lý thanh toán.',
        );
      }
    };

    handleCallback();
  }, [searchParams]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        {status === 'loading' && (
          <div>
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Đang xử lý thanh toán...</p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-green-600 mb-4">
              Thanh toán thành công!
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Về trang chủ
              </Link>
              <Link
                href="/orders"
                className="px-6 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                Xem đơn hàng
              </Link>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div>
            <XCircle size={64} className="text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-red-600 mb-4">
              Thanh toán thất bại
            </h1>
            <p className="text-gray-600 mb-6">{message}</p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/cart"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Quay lại giỏ hàng
              </Link>
              <Link
                href="/"
                className="px-6 py-3 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                Về trang chủ
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

