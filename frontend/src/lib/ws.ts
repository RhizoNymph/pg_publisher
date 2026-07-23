import { WSSamplePayload } from "./types";

export type SampleListener = (payload: WSSamplePayload) => void;

export class LiveSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<SampleListener>();
  private subscribed = new Set<string>();
  private reconnectTimer: number | null = null;

  connect(): void {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.subscribed.size > 0) {
        ws.send(
          JSON.stringify({
            type: "subscribe",
            connection_ids: [...this.subscribed],
          }),
        );
      }
    };
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data?.type === "sample") {
          const parsed = WSSamplePayload.parse(data);
          for (const l of this.listeners) l(parsed);
        }
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.reconnectTimer === null) {
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, 1500);
      }
    };
    ws.onerror = () => ws.close();
  }

  subscribe(ids: string[]): void {
    for (const id of ids) this.subscribed.add(id);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "subscribe", connection_ids: ids }));
    }
  }

  unsubscribe(ids: string[]): void {
    for (const id of ids) this.subscribed.delete(id);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", connection_ids: ids }));
    }
  }

  onSample(l: SampleListener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

export const liveSocket = new LiveSocket();
