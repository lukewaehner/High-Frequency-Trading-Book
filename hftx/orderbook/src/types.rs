#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
    Bid,
    Ask,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct OrderId(pub u128);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Order {
    pub id: OrderId,
    pub symbol: String, // no lifetimes for now
    pub side: Side,
    pub px_ticks: i64, // integer price ticks
    pub qty: i64,      // integer lots
    pub ts_ns: u128,   // event time in ns
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Trade {
    pub maker: OrderId,
    pub taker: OrderId,
    pub symbol: String,
    pub px_ticks: i64, // integer price ticks
    pub qty: i64,      // integer lots
    pub ts_ns: u128,   // event time in ns
}

#[cfg(test)]
mod tests {}
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
}
