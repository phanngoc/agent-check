'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { useCartStore } from '@/lib/stores/cartStore';
import { useAuthStore } from '@/lib/stores/authStore';
import api from '@/lib/api';
import { useState } from 'react';

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    image: string | null;
    stock: number;
  };
}

export default function ProductCard({ product }: ProductCardProps) {
  const [isAdding, setIsAdding] = useState(false);
  const { addItem, setLoading } = useCartStore();
  const { isAuthenticated } = useAuthStore();

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      // Store intended action and redirect to login
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('redirectAfterLogin', '/cart');
        window.location.href = '/login';
      }
      return;
    }

    setIsAdding(true);
    setLoading(true);

    try {
      const response = await api.post('/cart', {
        productId: product.id,
        quantity: 1,
      });

      addItem(response.data);
    } catch (error) {
      console.error('Failed to add to cart:', error);
      alert('Không thể thêm sản phẩm vào giỏ hàng');
    } finally {
      setIsAdding(false);
      setLoading(false);
    }
  };

  return (
    <div className="group relative bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      <Link href={`/products/${product.id}`}>
        <div className="aspect-square relative bg-gray-100">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              No Image
            </div>
          )}
        </div>
      </Link>
      <div className="p-4">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 hover:text-blue-600">
            {product.name}
          </h3>
        </Link>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold text-blue-600">
            {formatPrice(Number(product.price))}
          </span>
          <button
            onClick={handleAddToCart}
            disabled={isAdding || product.stock === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <ShoppingCart size={18} />
            {isAdding ? 'Đang thêm...' : 'Thêm vào giỏ'}
          </button>
        </div>
        {product.stock === 0 && (
          <p className="text-sm text-red-500 mt-2">Hết hàng</p>
        )}
      </div>
    </div>
  );
}

