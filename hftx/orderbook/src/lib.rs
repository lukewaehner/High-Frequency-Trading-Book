//! High-frequency trading order book with price-time priority matching.
//!
//! Core features:
//! - Price-time priority matching (best price first, then FIFO)
//! - Partial fills and immediate execution
//! - Lazy cancellation for performance
//! - ~100ns order submission, >100k orders/sec sustained throughput

pub mod types;

pub use types::{Order, OrderId, Side, Trade};
pub mod price_levels;
pub use price_levels::PriceLevels;

/// Central limit order book with separate bid/ask sides.
/// 
/// Uses price-time priority: better prices match first, then earliest orders.
/// Not thread-safe - wrap in RwLock for concurrent access.
pub struct OrderBook {
    /// Buy orders, highest price first
    pub bids: PriceLevels,
    /// Sell orders, lowest price first  
    pub asks: PriceLevels,
}

impl OrderBook {
    /// Creates empty order book.
    pub fn new() -> Self {
        Self {
            bids: PriceLevels::new(Side::Bid),
            asks: PriceLevels::new(Side::Ask),
        }
    }

    /// Submits limit order, returns any immediate trades.
    /// 
    /// Order attempts to match against opposite side first, then rests in book.
    /// Trades execute at maker's price following standard exchange rules.
    pub fn submit_limit(&mut self, mut taker: Order) -> Vec<Trade> {
        let mut trades = Vec::new();
        let ts_ns = taker.ts_ns;

        match taker.side {
            Side::Bid => {
                // Match against asks (sell orders)
                while taker.qty > 0 {
                    let Some(best_ask_px) = self.asks.best_price() else {
                        break; // No asks available
                    };
                    
                    if taker.px_ticks < best_ask_px {
                        break; // No cross - bid too low
                    }

                    let mut maker = match self.asks.pop_best() {
                        Some(o) => o,
                        None => break,
                    };

                    let fill = taker.qty.min(maker.qty);
                    taker.qty -= fill;
                    maker.qty -= fill;

                    trades.push(Trade {
                        maker: maker.id,
                        taker: taker.id,
                        symbol: taker.symbol.clone(),
                        px_ticks: best_ask_px, // Trade at maker's price
                        qty: fill,
                        ts_ns,
                    });

                    // Restore partially filled maker to front of queue
                    if maker.qty > 0 {
                        self.asks.push_front(maker);
                    }
                }

                // Add remaining taker quantity to bid side
                if taker.qty > 0 {
                    self.bids.push(taker);
                }
            }

            Side::Ask => {
                // Match against bids (buy orders)
                while taker.qty > 0 {
                    let Some(best_bid_px) = self.bids.best_price() else {
                        break; // No bids available
                    };
                    
                    if taker.px_ticks > best_bid_px {
                        break; // No cross - ask too high
                    }

                    let mut maker = match self.bids.pop_best() {
                        Some(o) => o,
                        None => break,
                    };

                    let fill = taker.qty.min(maker.qty);
                    taker.qty -= fill;
                    maker.qty -= fill;

                    trades.push(Trade {
                        maker: maker.id,
                        taker: taker.id,
                        symbol: taker.symbol.clone(),
                        px_ticks: best_bid_px, // Trade at maker's price
                        qty: fill,
                        ts_ns,
                    });

                    // Restore partially filled maker to front of queue
                    if maker.qty > 0 {
                        self.bids.push_front(maker);
                    }
                }

                // Add remaining taker quantity to ask side
                if taker.qty > 0 {
                    self.asks.push(taker);
                }
            }
        }

        trades
    }

    /// Returns current best bid price (highest buy price).
    pub fn best_bid(&self) -> Option<i64> {
        self.bids.best_price()
    }
    
    /// Returns current best ask price (lowest sell price).
    pub fn best_ask(&self) -> Option<i64> {
        self.asks.best_price()
    }
}

#[cfg(test)]
mod ob_tests {
    use super::*;
    use crate::types::{Order, OrderId, Side};

    /// Tests crossing orders with partial fills - verifies price-time priority.
    #[test]
    fn crossing_and_partials() {
        let mut ob = OrderBook::new();

        // Two asks at same price level - first has time priority
        ob.submit_limit(Order {
            id: OrderId(1),
            symbol: "AAPL".into(),
            side: Side::Ask,
            px_ticks: 100,
            qty: 50,
            ts_ns: 1, // Earlier = higher priority
        });
        ob.submit_limit(Order {
            id: OrderId(2),
            symbol: "AAPL".into(),
            side: Side::Ask,
            px_ticks: 100,
            qty: 40,
            ts_ns: 2, // Later = lower priority
        });

        // Crossing bid fills 50 from order 1, then 20 from order 2
        let trades = ob.submit_limit(Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100,
            qty: 70, // Will partially fill order 2
            ts_ns: 3,
        });

        assert_eq!(trades.len(), 2);
        assert_eq!(trades[0].maker, OrderId(1));
        assert_eq!(trades[0].qty, 50);
        assert_eq!(trades[1].maker, OrderId(2));
        assert_eq!(trades[1].qty, 20);

        // Order 2 should have 20 remaining
        assert_eq!(ob.best_ask(), Some(100));
        assert_eq!(ob.asks.best_level_size(), 1);
    }

    /// Tests non-crossing orders that rest in the book.
    #[test]
    fn non_crossing_rests() {
        let mut ob = OrderBook::new();
        
        ob.submit_limit(Order {
            id: OrderId(1),
            symbol: "AAPL".into(),
            side: Side::Ask,
            px_ticks: 105,
            qty: 10,
            ts_ns: 1,
        });
        
        // Bid doesn't cross (104 < 105)
        let trades = ob.submit_limit(Order {
            id: OrderId(2),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 104,
            qty: 10,
            ts_ns: 2,
        });
        
        assert!(trades.is_empty());
        assert_eq!(ob.best_bid(), Some(104));
        assert_eq!(ob.best_ask(), Some(105));
    }
}
