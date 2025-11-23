'use client';

import { ShoppingBag } from 'lucide-react';
import { useCartStore } from '@/lib/stores/cartStore';
import { useState } from 'react';
import CartDrawer from './CartDrawer';

export default function Cart() {
  const { getItemCount } = useCartStore();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const itemCount = getItemCount();

  return (
    <>
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <ShoppingBag size={24} />
        {itemCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {itemCount}
          </span>
        )}
      </button>
      <CartDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

