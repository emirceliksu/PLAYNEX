import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { notFoundMetadata } from '@/lib/not-found-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return notFoundMetadata(locale);
}

// Unmatched paths would otherwise fall through to Next's root 404, which has no locale,
// no <html lang> and none of our styling. Routing them here renders [locale]/not-found.
export default function UnmatchedRoute() {
  notFound();
}
