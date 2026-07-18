//! Core data types for the order book.
//!
//! All types use integer ticks for prices
//! Timestamps are nanoseconds since epoch for high-precision time priority.

use serde::{Deserialize, Serialize};

/// Order side - Bid (buy) or Ask (sell).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Side {
    Bid,
    Ask,
}

/// Time-in-force instructions for order lifetime.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum TimeInForce {
    /// Active until end of trading session
    #[default]
    Day,
    /// Execute immediately, cancel remainder
    IOC,
    /// Execute entire order immediately or cancel
    FOK,
}

/// Order execution type.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum OrderKind {
    /// Execute only at specified price or better
    #[default]
    Limit,
    /// Execute immediately at best available price
    Market,
}

/// Unique order identifier.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct OrderId(pub u128);

/// Complete order specification.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Order {
    pub id: OrderId,
    pub symbol: String,
    pub side: Side,
    pub px_ticks: i64,       // Price in integer ticks; i64::MAX/MIN for market orders
    pub qty: i64,            // Quantity in shares/lots
    pub ts_ns: u128,         // Timestamp in nanoseconds
    pub kind: OrderKind,
    pub tif: TimeInForce,
}

impl Order {
    /// Limit order: rests in book if not immediately matched.
    pub fn limit(id: OrderId, symbol: &str, side: Side, px_ticks: i64, qty: i64, ts_ns: u128) -> Self {
        Self { id, symbol: symbol.to_string(), side, px_ticks, qty, ts_ns, kind: OrderKind::Limit, tif: TimeInForce::Day }
    }

    /// Market order: crosses at any available price; remainder is always discarded (IOC semantics).
    /// Uses sentinel prices (i64::MAX for buys, i64::MIN for sells) so the existing
    /// crossing logic works without any special-casing.
    pub fn market(id: OrderId, symbol: &str, side: Side, qty: i64, ts_ns: u128) -> Self {
        let px_ticks = match side {
            Side::Bid => i64::MAX,
            Side::Ask => i64::MIN,
        };
        Self { id, symbol: symbol.to_string(), side, px_ticks, qty, ts_ns, kind: OrderKind::Market, tif: TimeInForce::IOC }
    }
}

/// Trade execution record.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Trade {
    pub maker: OrderId, // Resting order (provides liquidity)
    pub taker: OrderId, // Incoming order (takes liquidity)
    pub symbol: String,
    pub px_ticks: i64, // Execution price (always maker's price)
    pub qty: i64,      // Quantity traded
    pub ts_ns: u128,   // Execution timestamp
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_order_creation() {
        let o = Order {
            id: OrderId(1),
            symbol: "AAPL".to_string(),
            side: Side::Bid,
            px_ticks: 195_430,
            qty: 100,
            ts_ns: 123_456_789,
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        };

        let t = Trade {
            maker: OrderId(2),
            taker: o.id,
            symbol: o.symbol.clone(),
            px_ticks: o.px_ticks,
            qty: 100,
            ts_ns: o.ts_ns + 10,
        };

        assert_eq!(o.side, Side::Bid);
        assert_eq!(t.qty, 100);
        assert!(o.px_ticks > 0);
        assert_eq!(t.taker, o.id);
        assert_eq!(t.symbol, o.symbol);
        assert!(t.ts_ns > o.ts_ns);
    }
}
