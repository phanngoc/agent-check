'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/lib/stores/cartStore';
import { useAuthStore } from '@/lib/stores/authStore';
import { formatPrice } from '@/lib/utils';
import api from '@/lib/api';
import Link from 'next/link';

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const {
    items,
    setItems,
    updateItem,
    removeItem,
    getTotal,
    setLoading,
    isLoading,
  } = useCartStore();
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login?redirect=/cart');
      return;
    }
    fetchCart();
  }, [isAuthenticated]);

  const fetchCart = async () => {
    setLoading(true);
    try {
      const response = await api.get('/cart');
      setItems(response.data);
    } catch (error) {
      console.error('Failed to fetch cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuantity = async (itemId: string, newQuantity: number) => {
    if (newQuantity < 1) return;

    setUpdating(itemId);
    setLoading(true);

    try {
      await api.put(`/cart/${itemId}`, { quantity: newQuantity });
      updateItem(itemId, newQuantity);
    } catch (error) {
      console.error('Failed to update cart:', error);
      alert('Không thể cập nhật giỏ hàng');
    } finally {
      setUpdating(null);
      setLoading(false);
    }
  };

  const handleRemove = async (itemId: string) => {
    setUpdating(itemId);
    setLoading(true);

    try {
      await api.delete(`/cart/${itemId}`);
      removeItem(itemId);
    } catch (error) {
      console.error('Failed to remove item:', error);
      alert('Không thể xóa sản phẩm');
    } finally {
      setUpdating(null);
      setLoading(false);
    }
  };

  if (!isAuthenticated || isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">Đang tải...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <ShoppingBag size={64} className="mx-auto text-gray-400 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Giỏ hàng trống</h2>
          <p className="text-gray-500 mb-6">Hãy thêm sản phẩm vào giỏ hàng</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Tiếp tục mua sắm
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Giỏ hàng</h1>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-white p-4 rounded-lg shadow-md flex gap-4"
            >
              <div className="w-24 h-24 bg-gray-100 rounded-lg flex-shrink-0">
                {item.product.image ? (
                  <img
                    src={item.product.image}
                    alt={item.product.name}
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-2">{item.product.name}</h3>
                <p className="text-blue-600 font-bold mb-4">
                  {formatPrice(Number(item.product.price))}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      handleUpdateQuantity(item.id, item.quantity - 1)
                    }
                    disabled={updating === item.id || item.quantity <= 1}
                    className="p-1 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="w-8 text-center">{item.quantity}</span>
                  <button
                    onClick={() =>
                      handleUpdateQuantity(item.id, item.quantity + 1)
                    }
                    disabled={updating === item.id}
                    className="p-1 border rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    disabled={updating === item.id}
                    className="ml-auto p-2 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md h-fit">
          <h2 className="text-xl font-bold mb-4">Tổng kết</h2>
          <div className="space-y-2 mb-4">
            <div className="flex justify-between">
              <span>Tạm tính:</span>
              <span>{formatPrice(getTotal())}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Tổng cộng:</span>
              <span className="text-blue-600">{formatPrice(getTotal())}</span>
            </div>
          </div>
          <Link
            href="/checkout"
            className="block w-full text-center py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Thanh toán
          </Link>
        </div>
      </div>
    </div>
  );
}

