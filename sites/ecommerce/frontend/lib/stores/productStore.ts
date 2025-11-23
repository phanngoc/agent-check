import { create } from 'zustand';

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  stock: number;
  category: string | null;
}

interface ProductState {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const useProductStore = create<ProductState>((set) => ({
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

export type { Product };

