import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { findGame } from '@/lib/catalog/games';

// The check lives above loading.tsx on purpose: once the loading fallback has streamed, the
// status is already 200 and a notFound() from the page can only render a soft 404.
export default async function GameLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!findGame(slug)) {
    notFound();
  }
  return children;
}
