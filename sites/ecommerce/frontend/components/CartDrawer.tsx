'use client';

import { X, Plus, Minus, Trash2, ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/lib/stores/cartStore';
import { formatPrice } from '@/lib/utils';
import Link from 'next/link';
import { useState } from 'react';
import api from '@/lib/api';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, updateItem, removeItem, getTotal, setLoading } = useCartStore();
  const [updating, setUpdating] = useState<string | null>(null);

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

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShoppingBag size={24} />
            Giỏ hàng
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <ShoppingBag size={64} className="mb-4" />
              <p>Giỏ hàng trống</p>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-4 p-4 border rounded-lg"
                >
                  <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0">
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
                    <h3 className="font-semibold mb-1">{item.product.name}</h3>
                    <p className="text-blue-600 font-bold mb-2">
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
                        className="ml-auto p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t p-4 space-y-4">
            <div className="flex justify-between text-lg font-bold">
              <span>Tổng cộng:</span>
              <span className="text-blue-600">{formatPrice(getTotal())}</span>
            </div>
            <Link
              href="/checkout"
              onClick={onClose}
              className="block w-full text-center py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Thanh toán
            </Link>
            <Link
              href="/cart"
              onClick={onClose}
              className="block w-full text-center py-2 text-blue-600 hover:underline"
            >
              Xem giỏ hàng chi tiết
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

