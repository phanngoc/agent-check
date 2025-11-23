'use client';

import { useCartSync } from '@/lib/hooks/useCartSync';

export default function CartSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useCartSync();
  return <>{children}</>;
}

