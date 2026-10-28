const PROTOCOL_VERSION = 1;
const PING_INTERVAL_MS = 5_000;
// Matches the server's reconnect grace: after this the seat is gone anyway.
const RECONNECT_WINDOW_MS = 30_000;
const RESUME_KEY = 'playnex:realtime:resume';

export interface ServerFrame {
  type: string;
  payload: unknown;
}

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

interface ConnectionEvents {
  onFrame(frame: ServerFrame): void;
  onStatus(status: ConnectionStatus): void;
  // Fired after every successful hello, including the ones that follow a reconnect.
  onGreeted(playerId: string): void;
}

export function realtimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (configured) return `${configured.replace(/\/$/, '')}/ws`;
  // In production the edge proxy serves /ws on the same origin as the pages.
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
}

function readResumeToken(): string | undefined {
  try {
    return window.sessionStorage.getItem(RESUME_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeResumeToken(token: string) {
  try {
    window.sessionStorage.setItem(RESUME_KEY, token);
  } catch {
    // Without storage a reconnect simply starts as a new guest.
  }
}

export class RealtimeConnection {
  private socket: WebSocket | null = null;
  private seq = 0;
  private pingTimer: number | undefined;
  private retryTimer: number | undefined;
  private retries = 0;
  private lostAt: number | null = null;
  private closed = false;
  private greeted = false;

  constructor(
    private readonly url: string,
    private readonly nickname: string,
    private readonly events: ConnectionEvents,
  ) {}

  open() {
    this.closed = false;
    this.events.onStatus(this.lostAt === null ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.write('hello', { nickname: this.nickname, resumeToken: readResumeToken() });
    });
    socket.addEventListener('message', (event: MessageEvent<string>) => {
      const frame = this.parse(event.data);
      if (!frame) return;
      if (frame.type === 'hello') {
        const hello = frame.payload as { playerId: string; resumeToken: string };
        storeResumeToken(hello.resumeToken);
        this.greeted = true;
        this.retries = 0;
        this.lostAt = null;
        this.startPing();
        this.events.onStatus('open');
        this.events.onGreeted(hello.playerId);
        return;
      }
      if (frame.type !== 'pong') {
        this.events.onFrame(frame);
      }
    });
    socket.addEventListener('close', () => this.handleClose(socket));
  }

  send(type: string, payload?: unknown) {
    if (!this.greeted) return;
    this.write(type, payload);
  }

  close() {
    this.closed = true;
    window.clearInterval(this.pingTimer);
    window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.events.onStatus('closed');
  }

  private write(type: string, payload?: unknown) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.seq += 1;
    this.socket.send(JSON.stringify({ v: PROTOCOL_VERSION, seq: this.seq, type, payload }));
  }

  private parse(data: string): ServerFrame | null {
    try {
      const frame = JSON.parse(data) as { type?: unknown; payload?: unknown };
      return typeof frame.type === 'string' ? { type: frame.type, payload: frame.payload } : null;
    } catch {
      return null;
    }
  }

  private startPing() {
    window.clearInterval(this.pingTimer);
    this.pingTimer = window.setInterval(
      () => this.write('ping', { t: performance.now() }),
      PING_INTERVAL_MS,
    );
  }

  private handleClose(socket: WebSocket) {
    if (socket !== this.socket) return;
    window.clearInterval(this.pingTimer);
    this.greeted = false;
    this.socket = null;
    if (this.closed) return;

    this.lostAt ??= Date.now();
    if (Date.now() - this.lostAt > RECONNECT_WINDOW_MS) {
      this.closed = true;
      this.events.onStatus('closed');
      return;
    }
    this.events.onStatus('reconnecting');
    const delay = Math.min(500 * 2 ** this.retries, 4_000);
    this.retries += 1;
    this.retryTimer = window.setTimeout(() => this.open(), delay);
  }
}
