import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { loadRelease } from '@/features/creator/load';

// Same reason as games/[slug]/layout.tsx: a hidden or unknown release must answer 404,
// which is only possible before loading.tsx has streamed.
export default async function ReleaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  if (!(await loadRelease(releaseId))) {
    notFound();
  }
  return children;
}
