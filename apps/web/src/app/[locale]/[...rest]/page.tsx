import { notFound } from 'next/navigation';

// Unmatched paths would otherwise fall through to Next's root 404, which has no locale,
// no <html lang> and none of our styling. Routing them here renders [locale]/not-found.
export default function UnmatchedRoute() {
  notFound();
}
