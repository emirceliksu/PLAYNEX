import { connect, createServer } from 'node:net';

// In Compose the browser lives in the Playwright container, so the app's
// `ws://localhost:8081` would point at nothing. This forwards that port to the
// realtime service; the Origin header stays the page's own, as in a real browser.
export default async function startRealtimeBridge() {
  const upstream = process.env.PLAYWRIGHT_REALTIME_UPSTREAM;
  if (!upstream) return;
  const [host = 'realtime', port = '8081'] = upstream.split(':');

  const server = createServer((client) => {
    const target = connect(Number(port), host);
    client.pipe(target).pipe(client);
    const close = () => {
      client.destroy();
      target.destroy();
    };
    client.on('error', close);
    target.on('error', close);
  });
  await new Promise<void>((resolve) => server.listen(8081, '127.0.0.1', resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
