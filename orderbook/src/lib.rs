//! High-frequency trading order book with price-time priority matching.
//!
//! Features:
//! - Price-time priority matching (best price first, then FIFO)
//! - Partial fills and immediate execution
//! - Lazy cancellation for performance
//! - Market orders via i64::MAX/MIN sentinel prices
//! - IOC (cancel remainder) and FOK (fill-or-kill) time-in-force
pub mod types;

pub use types::{Order, OrderId, OrderKind, OrderOutcome, OrderStatus, Side, TimeInForce, Trade};
pub mod price_levels;
pub use price_levels::PriceLevels;
use price_levels::Fill;

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

    /// Submits an order, respecting its `kind` and `tif`.
    ///
    /// **Market orders** use sentinel prices (`i64::MAX` for buys, `i64::MIN`
    /// for sells) so they cross against everything; any unfilled remainder is
    /// always discarded (IOC semantics regardless of the `tif` field).
    ///
    /// **TIF rules applied after the matching loop:**
    /// - `Day`  — rest any unfilled remainder in the book (standard limit behaviour)
    /// - `IOC`  — discard any unfilled remainder; never rests
    /// - `FOK`  — pre-check: if the book cannot fill the entire quantity at the
    ///            requested price, return an empty vec without touching the book
    pub fn submit(&mut self, mut taker: Order) -> OrderOutcome {
        let ts_ns = taker.ts_ns;
        let original_qty = taker.qty;
        let mut trades = Vec::new();

        // FOK pre-check: count fillable qty before touching the book.
        if taker.tif == TimeInForce::FOK {
            let available = match taker.side {
                Side::Bid => self.asks.fillable_qty(taker.px_ticks),
                Side::Ask => self.bids.fillable_qty(taker.px_ticks),
            };
            if available < taker.qty {
                // Can't fill entirely — kill the order without touching the book.
                return OrderOutcome::new(trades, 0, 0, original_qty);
            }
        }

        match taker.side {
            Side::Bid => {
                // Match against asks (sell orders). The maker is filled in place:
                // a partial fill leaves it at the front of its level (no BTree
                // re-insert, no id-index churn), and the taker's remaining qty
                // drives the loop.
                while taker.qty > 0 {
                    let Some(best_ask_px) = self.asks.best_price() else {
                        break; // No asks available
                    };

                    if taker.px_ticks < best_ask_px {
                        break; // No cross - bid too low
                    }

                    match self.asks.fill_front(best_ask_px, taker.qty) {
                        Some(Fill::Matched { maker, qty }) => {
                            taker.qty -= qty;
                            trades.push(Trade {
                                maker,
                                taker: taker.id,
                                symbol: taker.symbol.clone(), // Arc bump, not a heap copy
                                px_ticks: best_ask_px,        // Trade at maker's price
                                qty,
                                ts_ns,
                            });
                        }
                        // Level held only cancelled orders and was swept; the next
                        // iteration re-reads the new best price.
                        Some(Fill::Swept) => {}
                        None => break, // best_price() said Some, so this is unreachable
                    }
                }
            }

            Side::Ask => {
                // Match against bids (buy orders); see the Bid arm for the
                // in-place fill rationale.
                while taker.qty > 0 {
                    let Some(best_bid_px) = self.bids.best_price() else {
                        break; // No bids available
                    };

                    if taker.px_ticks > best_bid_px {
                        break; // No cross - ask too high
                    }

                    match self.bids.fill_front(best_bid_px, taker.qty) {
                        Some(Fill::Matched { maker, qty }) => {
                            taker.qty -= qty;
                            trades.push(Trade {
                                maker,
                                taker: taker.id,
                                symbol: taker.symbol.clone(),
                                px_ticks: best_bid_px,
                                qty,
                                ts_ns,
                            });
                        }
                        Some(Fill::Swept) => {}
                        None => break,
                    }
                }
            }
        }

        // Resting decision (applied once, after matching): only a Day limit with
        // an unfilled remainder rests. Market orders and IOC/FOK never rest — any
        // remainder is discarded, which classifies as PartiallyFilled/Cancelled.
        let remaining = taker.qty;
        let rests =
            remaining > 0 && taker.kind == OrderKind::Limit && taker.tif == TimeInForce::Day;
        let resting_qty = if rests { remaining } else { 0 };
        if rests {
            match taker.side {
                Side::Bid => self.bids.push(taker),
                Side::Ask => self.asks.push(taker),
            }
        }

        let filled_qty = original_qty - remaining;
        OrderOutcome::new(trades, filled_qty, resting_qty, original_qty)
    }

    /// Convenience wrapper returning only the immediate executions. Prefer
    /// [`OrderBook::submit`] when the order's disposition matters — this drops
    /// the [`OrderStatus`], so it cannot distinguish a rested order from a
    /// cancelled one. Kept for the latency/throughput harnesses that only need
    /// the trade list. Handles every order kind, not just limits.
    pub fn submit_limit(&mut self, order: Order) -> Vec<Trade> {
        self.submit(order).trades
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
    use crate::types::{Order, OrderId, OrderKind, Side, TimeInForce};

    fn limit(id: u128, side: Side, px: i64, qty: i64) -> Order {
        Order {
            id: OrderId(id),
            symbol: "AAPL".into(),
            side,
            px_ticks: px,
            qty,
            ts_ns: id, // reuse id as timestamp for uniqueness
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        }
    }

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
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        });
        ob.submit_limit(Order {
            id: OrderId(2),
            symbol: "AAPL".into(),
            side: Side::Ask,
            px_ticks: 100,
            qty: 40,
            ts_ns: 2, // Later = lower priority
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        });

        // Crossing bid fills 50 from order 1, then 20 from order 2
        let trades = ob.submit_limit(Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100,
            qty: 70, // Will partially fill order 2
            ts_ns: 3,
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
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
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        });

        // Bid doesn't cross (104 < 105)
        let trades = ob.submit_limit(Order {
            id: OrderId(2),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 104,
            qty: 10,
            ts_ns: 2,
            kind: OrderKind::Limit,
            tif: TimeInForce::Day,
        });

        assert!(trades.is_empty());
        assert_eq!(ob.best_bid(), Some(104));
        assert_eq!(ob.best_ask(), Some(105));
    }

    // --- Market order tests ---

    #[test]
    fn market_buy_sweeps_asks() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 30));
        ob.submit(limit(2, Side::Ask, 102, 20));

        let out = ob.submit(Order::market(OrderId(10), "AAPL", Side::Bid, 40, 10));
        let trades = &out.trades;

        // Sweeps 30 from the 100 level, then 10 from the 102 level
        assert_eq!(trades.len(), 2);
        assert_eq!(trades[0].qty, 30);
        assert_eq!(trades[0].px_ticks, 100);
        assert_eq!(trades[1].qty, 10);
        assert_eq!(trades[1].px_ticks, 102);
        assert_eq!(out.status, OrderStatus::Filled);
        assert_eq!(out.filled_qty, 40);

        // Market order must never rest even with leftover qty
        assert_eq!(ob.best_bid(), None);
        // 10 shares remain at 102
        assert_eq!(ob.best_ask(), Some(102));
    }

    #[test]
    fn market_sell_sweeps_bids() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Bid, 100, 30));
        ob.submit(limit(2, Side::Bid, 98, 20));

        let out = ob.submit(Order::market(OrderId(10), "AAPL", Side::Ask, 40, 10));
        let trades = &out.trades;

        assert_eq!(trades.len(), 2);
        assert_eq!(trades[0].qty, 30);
        assert_eq!(trades[0].px_ticks, 100);
        assert_eq!(trades[1].qty, 10);
        assert_eq!(trades[1].px_ticks, 98);
        assert_eq!(out.status, OrderStatus::Filled);

        assert_eq!(ob.best_ask(), None); // never rested
        assert_eq!(ob.best_bid(), Some(98)); // 10 remain at 98
    }

    #[test]
    fn market_order_empty_book_produces_no_trades_and_does_not_rest() {
        let mut ob = OrderBook::new();
        let out = ob.submit(Order::market(OrderId(1), "AAPL", Side::Bid, 100, 1));
        assert!(out.trades.is_empty());
        // A market order with no liquidity is cancelled, NOT rested — an empty
        // trade list must not be reported as a resting order.
        assert_eq!(out.status, OrderStatus::Cancelled);
        assert_eq!(ob.best_bid(), None); // must not rest
    }

    // --- IOC tests ---

    #[test]
    fn ioc_partial_fill_drops_remainder() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 30)); // only 30 available

        let ioc = Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100,
            qty: 50, // wants 50, only 30 fillable
            ts_ns: 10,
            kind: OrderKind::Limit,
            tif: TimeInForce::IOC,
        };
        let out = ob.submit(ioc);

        assert_eq!(out.trades.len(), 1);
        assert_eq!(out.trades[0].qty, 30);
        // Filled 30 of 50; the 20 remainder is discarded, not rested.
        assert_eq!(out.status, OrderStatus::PartiallyFilled);
        assert_eq!(out.filled_qty, 30);
        // IOC remainder must not rest
        assert_eq!(ob.best_bid(), None);
        assert_eq!(ob.best_ask(), None); // the 30-lot ask was fully consumed
    }

    #[test]
    fn ioc_no_cross_returns_empty_and_does_not_rest() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 110, 50));

        let ioc = Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100, // below the ask — no cross
            qty: 20,
            ts_ns: 10,
            kind: OrderKind::Limit,
            tif: TimeInForce::IOC,
        };
        let out = ob.submit(ioc);

        assert!(out.trades.is_empty());
        assert_eq!(out.status, OrderStatus::Cancelled); // no cross, no rest
        assert_eq!(ob.best_bid(), None); // must not rest
    }

    // --- FOK tests ---

    #[test]
    fn fok_fills_when_book_has_enough() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 60)); // 60 available at 100

        let fok = Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100,
            qty: 50, // 50 <= 60 — can fill
            ts_ns: 10,
            kind: OrderKind::Limit,
            tif: TimeInForce::FOK,
        };
        let out = ob.submit(fok);

        assert_eq!(out.trades.len(), 1);
        assert_eq!(out.trades[0].qty, 50);
        assert_eq!(out.status, OrderStatus::Filled);
        assert_eq!(ob.asks.qty_at_price(100), 10); // 10 remain
    }

    #[test]
    fn fok_cancelled_when_book_insufficient() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 30)); // only 30 available

        let fok = Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 100,
            qty: 50, // 50 > 30 — cannot fill
            ts_ns: 10,
            kind: OrderKind::Limit,
            tif: TimeInForce::FOK,
        };
        let out = ob.submit(fok);

        // Book must be completely unchanged
        assert!(out.trades.is_empty());
        // FOK that can't fill in full is cancelled — not rested.
        assert_eq!(out.status, OrderStatus::Cancelled);
        assert_eq!(ob.asks.qty_at_price(100), 30);
        assert_eq!(ob.best_bid(), None);
    }

    #[test]
    fn fok_cancelled_when_price_insufficient() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 110, 100)); // 100 shares but at price 110

        let fok = Order {
            id: OrderId(10),
            symbol: "AAPL".into(),
            side: Side::Bid,
            px_ticks: 105, // bid only 105, ask is 110 — no cross
            qty: 50,
            ts_ns: 10,
            kind: OrderKind::Limit,
            tif: TimeInForce::FOK,
        };
        let out = ob.submit(fok);

        assert!(out.trades.is_empty());
        assert_eq!(out.status, OrderStatus::Cancelled);
        assert_eq!(ob.asks.qty_at_price(110), 100); // book untouched
    }

    // --- Resting-disposition tests (Day limits) ---

    #[test]
    fn day_limit_no_cross_is_rested() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 110, 50)); // ask sits above

        let out = ob.submit(limit(2, Side::Bid, 100, 20)); // bid below — no cross

        assert!(out.trades.is_empty());
        assert_eq!(out.status, OrderStatus::Rested);
        assert_eq!(out.resting_qty, 20);
        assert_eq!(ob.best_bid(), Some(100)); // the full order rests
    }

    // --- Cancelled-maker handling during matching (fill_front skip + sweep) ---

    /// A cancelled maker at the front of a level must be skipped, and the taker
    /// matched against the next live maker behind it.
    #[test]
    fn matching_skips_cancelled_maker_at_front() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 50)); // front of the 100 level
        ob.submit(limit(2, Side::Ask, 100, 40)); // behind order 1, same level

        // Cancel the first-in-line maker; it must not trade.
        assert!(ob.asks.cancel(OrderId(1)));

        let out = ob.submit(limit(10, Side::Bid, 100, 30));

        assert_eq!(out.trades.len(), 1);
        assert_eq!(out.trades[0].maker, OrderId(2)); // order 1 was cancelled
        assert_eq!(out.trades[0].qty, 30);
        // Order 2 has 10 left resting at 100; order 1 is gone.
        assert_eq!(ob.best_ask(), Some(100));
        assert_eq!(ob.asks.qty_at_price(100), 10);
    }

    /// When the only orders at the crossing level are cancelled, the level is
    /// swept and a Day limit rests rather than trading against a ghost.
    #[test]
    fn matching_sweeps_fully_cancelled_level_then_rests() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 50));
        assert!(ob.asks.cancel(OrderId(1)));

        let out = ob.submit(limit(10, Side::Bid, 100, 30));

        assert!(out.trades.is_empty());
        assert_eq!(out.status, OrderStatus::Rested);
        assert_eq!(ob.best_ask(), None); // swept
        assert_eq!(ob.best_bid(), Some(100)); // the bid rests
    }

    #[test]
    fn day_limit_partial_cross_rests_remainder_is_partially_filled_resting() {
        let mut ob = OrderBook::new();
        ob.submit(limit(1, Side::Ask, 100, 30)); // only 30 available at the cross

        let out = ob.submit(limit(2, Side::Bid, 100, 50)); // wants 50 @ 100

        assert_eq!(out.trades.len(), 1);
        assert_eq!(out.trades[0].qty, 30);
        assert_eq!(out.filled_qty, 30);
        assert_eq!(out.resting_qty, 20);
        assert_eq!(out.status, OrderStatus::PartiallyFilledResting);
        assert_eq!(ob.best_bid(), Some(100)); // 20 rest at 100
    }
}
