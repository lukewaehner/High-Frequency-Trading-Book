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
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "ping")]
    Ping { timestamp: u128 },
    #[serde(rename = "pong")]
    Pong { timestamp: u128 },
} 