import { forbidden } from 'next/navigation';
import type { ReactNode } from 'react';

import { getCurrentAccount } from '@/lib/auth/session';

// Above admin/loading.tsx so the 403 status is set before anything streams.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const account = await getCurrentAccount();
  if (account?.role !== 'admin') {
    forbidden();
  }
  return children;
}
