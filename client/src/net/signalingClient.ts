import type { ClientToServer, ServerToClient } from './protocol';

type Listener<T> = (payload: T) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Listener<any>[]> = new Map();
  private url: string;
  private reconnectAttempt = 0;
  private closedByUser = false;
  private sendQueue: ClientToServer[] = [];

  status: 'connecting' | 'open' | 'closed' = 'connecting';

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    this.status = 'connecting';
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.addEventListener('open', () => {
      this.status = 'open';
      this.reconnectAttempt = 0;
      this.emit('open', undefined);
      for (const msg of this.sendQueue.splice(0)) this.send(msg);
    });
    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerToClient;
        this.emit(msg.t, msg);
        this.emit('*', msg);
      } catch {
        // ignore malformed messages
      }
    });
    ws.addEventListener('close', () => {
      this.status = 'closed';
      this.emit('close', undefined);
      if (!this.closedByUser) this.scheduleReconnect();
    });
    ws.addEventListener('error', () => {
      ws.close();
    });
  }

  private scheduleReconnect() {
    const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, delay);
  }

  send(msg: ClientToServer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.sendQueue.push(msg);
    }
  }

  on<T extends ServerToClient['t'] | 'open' | 'close' | '*'>(type: T, cb: Listener<any>) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(cb);
    return () => {
      const arr = this.listeners.get(type);
      if (arr) this.listeners.set(type, arr.filter((l) => l !== cb));
    };
  }

  private emit(type: string, payload: unknown) {
    for (const cb of this.listeners.get(type) ?? []) cb(payload);
  }

  close() {
    this.closedByUser = true;
    this.ws?.close();
  }
}

export function signalingUrl(): string {
  const configured = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (configured) return configured;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname}:8787`;
}
