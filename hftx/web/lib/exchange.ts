// REST + WebSocket client for the hftx exchange-service.
// Default endpoint is localhost:8080. Override with NEXT_PUBLIC_HFTX_URL.

import type {
  BatchOrderResult,
  BatchSubmitRequest,
  BatchSubmitResponse,
  BotConfig,
  DepthStreamMsg,
  LatencySample,
  LatencyStreamMsg,
  MarketDepth,
  OrderBookState,
  OrderStreamMsg,
  SimStatusResponse,
  SubmitOrderRequest,
  SubmitOrderResponse,
  SymbolsResponse,
  TradeStreamMsg,
} from "./types";

const REST_BASE =
  process.env.NEXT_PUBLIC_HFTX_URL ?? "http://localhost:8080";

const WS_BASE = REST_BASE.replace(/^http/, "ws");

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchSymbols(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${REST_BASE}/symbols`, { signal, cache: "no-store" });
  const body = await jsonOrThrow<SymbolsResponse>(res);
  return body.symbols;
}

export async function fetchHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const res = await fetch(`${REST_BASE}/health`, {
      signal,
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchDepth(
  symbol: string,
  levels = 12,
  signal?: AbortSignal,
): Promise<MarketDepth> {
  const res = await fetch(
    `${REST_BASE}/symbols/${encodeURIComponent(symbol)}/depth?levels=${levels}`,
    { signal, cache: "no-store" },
  );
  return jsonOrThrow<MarketDepth>(res);
}

export async function fetchOrderbookState(
  symbol: string,
  signal?: AbortSignal,
): Promise<OrderBookState> {
  const res = await fetch(
    `${REST_BASE}/symbols/${encodeURIComponent(symbol)}/orderbook`,
    { signal, cache: "no-store" },
  );
  return jsonOrThrow<OrderBookState>(res);
}

export async function submitOrder(
  symbol: string,
  req: SubmitOrderRequest,
  signal?: AbortSignal,
): Promise<SubmitOrderResponse> {
  const res = await fetch(
    `${REST_BASE}/symbols/${encodeURIComponent(symbol)}/orders`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    },
  );
  return jsonOrThrow<SubmitOrderResponse>(res);
}

export interface SubmitWithLatency extends SubmitOrderResponse {
  /** Round-trip wall time in nanoseconds (perf.now() based). */
  latency_ns: number;
}

export async function submitOrderTimed(
  symbol: string,
  req: SubmitOrderRequest,
  signal?: AbortSignal,
): Promise<SubmitWithLatency> {
  const t0 = performance.now();
  const result = await submitOrder(symbol, req, signal);
  const latency_ns = (performance.now() - t0) * 1_000_000;
  return { ...result, latency_ns };
}

export interface BatchSubmitWithRtt extends BatchSubmitResponse {
  /** Wall round-trip across the network for the entire batch, in nanoseconds. */
  rtt_ns: number;
}

/**
 * Submits a batch of orders for one symbol in a single HTTP request. The
 * server processes them under one write lock and returns engine-measured
 * per-order latency_ns — the histogram-worthy number, untainted by network
 * RTT. Intended for the sim driver where one tick produces N orders.
 */
export async function submitOrderBatch(
  symbol: string,
  orders: SubmitOrderRequest[],
  signal?: AbortSignal,
): Promise<BatchSubmitWithRtt> {
  const t0 = performance.now();
  const body: BatchSubmitRequest = { orders };
  const res = await fetch(
    `${REST_BASE}/symbols/${encodeURIComponent(symbol)}/orders/batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
  const result = await jsonOrThrow<BatchSubmitResponse>(res);
  const rtt_ns = (performance.now() - t0) * 1_000_000;
  return { ...result, rtt_ns };
}

// WebSocket helpers ----------------------------------------------------------

export interface StreamHandle {
  close(): void;
}

export function openTradeStream(
  symbol: string,
  onMessage: (msg: TradeStreamMsg) => void,
  opts: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
  } = {},
): StreamHandle {
  return openStream<TradeStreamMsg>(
    `${WS_BASE}/symbols/${encodeURIComponent(symbol)}/trades/stream`,
    onMessage,
    opts,
  );
}

export function openDepthStream(
  symbol: string,
  onMessage: (msg: DepthStreamMsg) => void,
  opts: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
  } = {},
): StreamHandle {
  return openStream<DepthStreamMsg>(
    `${WS_BASE}/symbols/${encodeURIComponent(symbol)}/depth/stream`,
    onMessage,
    opts,
  );
}

export interface OrderStreamHandle {
  send(orders: SubmitOrderRequest[]): number | null;
  close(): void;
  readonly bufferedAmount: number;
  readonly isOpen: boolean;
}

export function openOrderStream(
  symbol: string,
  onResult: (seq: number, results: BatchOrderResult[], engine_ns: number) => void,
  opts: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
  } = {},
): OrderStreamHandle {
  const url = `${WS_BASE}/symbols/${encodeURIComponent(symbol)}/orders/stream`;
  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let reconnectDelay = 800;
  let seq = 0;

  const connect = () => {
    if (closedByCaller) return;
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      reconnectDelay = 800;
      opts.onOpen?.();
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as OrderStreamMsg;
        if (msg.type === "ping" && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pong", timestamp: msg.timestamp }));
          return;
        }
        if (msg.type === "result") {
          onResult(msg.seq, msg.results, msg.engine_ns);
        }
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener("error", (e) => {
      opts.onError?.(e);
    });

    ws.addEventListener("close", () => {
      opts.onClose?.();
      if (closedByCaller) return;
      const delay = Math.min(reconnectDelay, 8_000);
      reconnectDelay = Math.min(reconnectDelay * 1.7, 8_000);
      setTimeout(connect, delay);
    });
  };

  connect();

  return {
    send(orders) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return null;
      const mySeq = ++seq;
      ws.send(JSON.stringify({ type: "batch", seq: mySeq, orders }));
      return mySeq;
    },
    close() {
      closedByCaller = true;
      ws?.close();
    },
    get bufferedAmount() {
      return ws?.bufferedAmount ?? 0;
    },
    get isOpen() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
}

// ----- Server-side bot driver ------------------------------------------------

export async function startServerSim(
  config: BotConfig,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${REST_BASE}/sim/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
}

export async function stopServerSim(
  symbol: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${REST_BASE}/sim/stop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
}

export async function fetchServerSimStatus(
  signal?: AbortSignal,
): Promise<SimStatusResponse> {
  const res = await fetch(`${REST_BASE}/sim/status`, {
    signal,
    cache: "no-store",
  });
  return jsonOrThrow<SimStatusResponse>(res);
}

/**
 * Subscribes to the server-side latency sample stream. Filters out ping/pong
 * envelopes; the caller only sees `LatencySample` payloads.
 */
export function openLatencyStream(
  _symbol: string,
  onSample: (sample: LatencySample) => void,
  opts: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
  } = {},
): StreamHandle {
  return openStream<LatencyStreamMsg>(
    `${WS_BASE}/sim/latency/stream`,
    (msg) => {
      if (msg.type === "latency") {
        onSample({
          latency_ns: msg.latency_ns,
          filled: msg.filled,
          ts_ms: msg.ts_ms,
        });
      }
    },
    opts,
  );
}

function openStream<T>(
  url: string,
  onMessage: (msg: T) => void,
  opts: {
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (e: Event) => void;
  },
): StreamHandle {
  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let reconnectDelay = 800;

  const connect = () => {
    if (closedByCaller) return;
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      reconnectDelay = 800;
      opts.onOpen?.();
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as T & { type: string };
        // Auto-respond to ping
        if (msg.type === "ping" && ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "pong",
              timestamp: (msg as { timestamp?: number }).timestamp ?? Date.now(),
            }),
          );
          return;
        }
        onMessage(msg);
      } catch {
        // ignore malformed
      }
    });

    ws.addEventListener("error", (e) => {
      opts.onError?.(e);
    });

    ws.addEventListener("close", () => {
      opts.onClose?.();
      if (closedByCaller) return;
      const delay = Math.min(reconnectDelay, 8_000);
      reconnectDelay = Math.min(reconnectDelay * 1.7, 8_000);
      setTimeout(connect, delay);
    });
  };

  connect();

  return {
    close() {
      closedByCaller = true;
      ws?.close();
    },
  };
}

export const exchangeConfig = {
  restBase: REST_BASE,
  wsBase: WS_BASE,
};
