'use client';

import Link from 'next/link';
import { useAuthStore } from '@/lib/stores/authStore';
import Cart from './Cart';
import SearchBar from './SearchBar';
import { User, LogOut } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore();

  return (
    <header className="bg-white shadow-md sticky top-0 z-30">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            Ecommerce
          </Link>

          <div className="flex-1 max-w-2xl">
            <SearchBar />
          </div>

          <div className="flex items-center gap-4">
            <Cart />
            {isAuthenticated ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/orders"
                  className="flex items-center gap-2 text-gray-700 hover:text-blue-600"
                >
                  <User size={20} />
                  <span className="hidden sm:inline">{user?.name}</span>
                </Link>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 text-gray-700 hover:text-red-600"
                >
                  <LogOut size={20} />
                  <span className="hidden sm:inline">Đăng xuất</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-4 py-2 text-gray-700 hover:text-blue-600"
                >
                  Đăng nhập
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Đăng ký
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

