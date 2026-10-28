import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { loadProfile } from '@/features/profile/load-profile';

// Above loading.tsx so an unknown player gets a real 404 status rather than a soft one.
export default async function ProfileLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  if (!(await loadProfile(decodeURIComponent(username)))) {
    notFound();
  }
  return children;
}
