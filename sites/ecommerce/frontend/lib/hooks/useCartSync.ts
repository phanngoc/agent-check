'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { useCartStore } from '@/lib/stores/cartStore';
import api from '@/lib/api';

export function useCartSync() {
  const { isAuthenticated } = useAuthStore();
  const { items, setItems, clearCart } = useCartStore();

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    // Sync cart from backend when user logs in
    const syncCart = async () => {
      try {
        const response = await api.get('/cart');
        const backendItems = response.data;

        // Merge with local cart if any
        if (items.length > 0) {
          // Add local items to backend
          for (const item of items) {
            try {
              await api.post('/cart', {
                productId: item.productId,
                quantity: item.quantity,
              });
            } catch (error) {
              // Item might already exist, try to update
              const existingItem = backendItems.find(
                (bi: any) => bi.productId === item.productId,
              );
              if (existingItem) {
                await api.put(`/cart/${existingItem.id}`, {
                  quantity: existingItem.quantity + item.quantity,
                });
              }
            }
          }
        }

        // Fetch updated cart from backend
        const updatedResponse = await api.get('/cart');
        setItems(updatedResponse.data);
        clearCart(); // Clear local cart after sync
      } catch (error) {
        console.error('Failed to sync cart:', error);
      }
    };

    syncCart();
  }, [isAuthenticated]);

  // Note: Cart sync is handled by individual cart operations (add, update, remove)
  // This hook only syncs when user logs in to merge local cart with backend
}

