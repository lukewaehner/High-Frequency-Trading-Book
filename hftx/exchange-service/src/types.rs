//! API types for REST and WebSocket interfaces.

use orderbook::{Side, Trade};
use serde::{Deserialize, Serialize};

/// Request to submit a new limit order.
#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitOrderRequest {
    pub side: Side,
    pub price: i64,
    pub quantity: i64,
}

/// Response after submitting an order.
#[derive(Debug, Serialize, Deserialize)]
pub struct SubmitOrderResponse {
    pub order_id: u128,
    pub status: String, // "accepted", "filled", "partial", "rejected"
    pub trades: Vec<Trade>, // Any immediate executions
}

/// Batch order submission. Orders are processed in array order under a single
/// write lock per book, amortizing lock + JSON-parse cost across the batch.
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchSubmitRequest {
    pub orders: Vec<SubmitOrderRequest>,
}

/// Per-order outcome inside a batch response. Trade count rather than full
/// trades keeps the wire payload compact under high tick rates; clients that
/// need trade detail should read the trade WS stream.
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchOrderResult {
    pub order_id: u128,
    pub filled: bool,
    pub trade_count: usize,
    /// Engine-side processing time for this order in nanoseconds.
    pub latency_ns: u128,
}

/// Aggregate batch response. `engine_ns` is wall time inside the handler
/// covering the full batch (lock + matching + broadcast).
#[derive(Debug, Serialize, Deserialize)]
pub struct BatchSubmitResponse {
    pub results: Vec<BatchOrderResult>,
    pub engine_ns: u128,
}

/// Query parameters for market depth requests.
#[derive(Debug, Serialize, Deserialize)]
pub struct DepthQuery {
    pub levels: Option<usize>,
}

/// List of available trading symbols.
#[derive(Debug, Serialize, Deserialize)]
pub struct SymbolsResponse {
    pub symbols: Vec<String>,
}

/// Current order book state snapshot.
#[derive(Debug, Serialize, Deserialize)]
pub struct OrderBookState {
    pub symbol: String,
    pub best_bid: Option<i64>,
    pub best_ask: Option<i64>,
    pub bid_levels: usize,
    pub ask_levels: usize,
    pub last_update: u128,
}

/// Aggregated orders at a specific price level.
#[derive(Debug, Serialize, Deserialize)]
pub struct PriceLevel {
    pub price: i64,
    pub quantity: i64, // Total quantity at this price
    pub orders: usize, // Number of individual orders
}

/// Market depth showing multiple price levels.
#[derive(Debug, Serialize, Deserialize)]
pub struct MarketDepth {
    pub symbol: String,
    pub bids: Vec<PriceLevel>, // Highest to lowest price
    pub asks: Vec<PriceLevel>, // Lowest to highest price
    pub timestamp: u128,
}

/// Trade execution event for WebSocket streaming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TradeEvent {
    pub symbol: String,
    pub trade: Trade,
    pub timestamp: u128,
}

/// Market depth update for WebSocket streaming.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthUpdate {
    pub symbol: String,
    pub best_bid: Option<i64>,
    pub best_ask: Option<i64>,
    pub bid_size: i64,
    pub ask_size: i64,
    pub timestamp: u128,
}

/// WebSocket message types.
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WebSocketMessage {
    #[serde(rename = "trade")]
    Trade(TradeEvent),
    #[serde(rename = "depth")]
    Depth(DepthUpdate),
    #[serde(rename = "latency")]
    Latency(LatencySample),
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "ping")]
    Ping { timestamp: u128 },
    #[serde(rename = "pong")]
    Pong { timestamp: u128 },
}

/// Configuration for a server-side bot driver. Mirrors the browser sim controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BotConfig {
    pub symbol: String,
    pub makers: u32,
    pub takers: u32,
    /// 0-100; higher = tighter maker spread, more taker crossing.
    pub aggression: u32,
    pub tick_ms: u64,
}

/// Request body for `POST /sim/start`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimStartRequest {
    pub symbol: String,
    pub makers: u32,
    pub takers: u32,
    pub aggression: u32,
    pub tick_ms: u64,
}

/// Request body for `POST /sim/stop`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimStopRequest {
    pub symbol: String,
}

/// One driver's status entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimStatusEntry {
    pub symbol: String,
    pub running: bool,
    pub config: BotConfig,
}

/// Aggregate driver status response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimStatusResponse {
    pub drivers: Vec<SimStatusEntry>,
}

/// Per-order latency sample broadcast on the latency stream.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct LatencySample {
    pub latency_ns: u128,
    pub filled: bool,
    pub ts_ms: u128,
}
