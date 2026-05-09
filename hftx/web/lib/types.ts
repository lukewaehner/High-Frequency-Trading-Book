// Wire types matching the Rust serde shapes from
// hftx/exchange-service/src/types.rs and hftx/orderbook/src/types.rs.
//
// Note on IDs: OrderId is u128 in Rust. JSON numbers in JS lose precision past
// 2^53, so very large IDs (UUID-derived) will be approximate. We accept this
// for display purposes. Cancellation by ID is therefore not exposed in the UI
// for sim bots (they never cancel).

export type Side = "Bid" | "Ask";

export interface Trade {
  maker: number;
  taker: number;
  symbol: string;
  px_ticks: number;
  qty: number;
  ts_ns: number;
}

export interface PriceLevel {
  price: number;
  quantity: number;
  orders: number;
}

// Full snapshot via REST GET /symbols/:symbol/depth
export interface MarketDepth {
  symbol: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  timestamp: number;
}

export interface OrderBookState {
  symbol: string;
  best_bid: number | null;
  best_ask: number | null;
  bid_levels: number;
  ask_levels: number;
  last_update: number;
}

export interface SubmitOrderRequest {
  side: Side;
  price: number;
  quantity: number;
}

export interface SubmitOrderResponse {
  order_id: number;
  status: string;
  trades: Trade[];
}

export interface BatchSubmitRequest {
  orders: SubmitOrderRequest[];
}

export interface BatchOrderResult {
  order_id: number;
  filled: boolean;
  trade_count: number;
  /** Engine-side processing time for this order in nanoseconds. */
  latency_ns: number;
}

export interface BatchSubmitResponse {
  results: BatchOrderResult[];
  /** Wall time inside the server handler covering the entire batch. */
  engine_ns: number;
}

export interface SymbolsResponse {
  symbols: string[];
}

// WS streaming envelopes — `#[serde(tag = "type")]` flattens single-struct variants

export interface TradeEvent {
  symbol: string;
  trade: Trade;
  timestamp: number;
}

// Depth stream gives best prices + aggregate sizes (NOT full ladder).
// Full ladder must be polled via REST.
export interface DepthUpdate {
  symbol: string;
  best_bid: number | null;
  best_ask: number | null;
  bid_size: number;
  ask_size: number;
  timestamp: number;
}

export type TradeStreamMsg =
  | ({ type: "trade" } & TradeEvent)
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number };

export type DepthStreamMsg =
  | ({ type: "depth" } & DepthUpdate)
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number };

export interface BotConfig {
  symbol: string;
  makers: number;
  takers: number;
  aggression: number;
  tick_ms: number;
}

export interface SimStatusEntry {
  symbol: string;
  running: boolean;
  config: BotConfig;
}

export interface SimStatusResponse {
  drivers: SimStatusEntry[];
}

export interface LatencySample {
  latency_ns: number;
  filled: boolean;
  ts_ms: number;
}

export type LatencyStreamMsg =
  | ({ type: "latency" } & LatencySample)
  | { type: "ping"; timestamp: number }
  | { type: "pong"; timestamp: number };
