import { callApi } from '@/lib/auth/api';
import { sessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

// The session cookie is HttpOnly, so the browser asks this server for a short-lived
// realtime ticket instead. Cross-site requests never get one.
export async function POST(request: Request) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }
  const token = await sessionToken();
  if (!token) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await callApi<{ ticket: string; expiresIn: number }>('/v1/realtime/ticket', {
    method: 'POST',
    token,
  });
  if (!result.ok) {
    return Response.json({ error: result.body.error }, { status: result.status });
  }
  return Response.json(result.data, { headers: { 'cache-control': 'no-store' } });
}
