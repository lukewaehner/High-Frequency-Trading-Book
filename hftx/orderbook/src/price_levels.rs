use crate::types::{Order, Side};
use std::collections::{BTreeMap, VecDeque};

// Structured price levels based, FIFO tracking with BTreeMap
// side determines which end of the map is the best
// - Asks: lowest price is best (front of map)
// - Bids: highest price is best (back of map)
pub struct PriceLevels {
    /// Bid or ask?
    side: Side,
    /// price ticks (i64) mapped to orders at the price
    /// stored in a queu or orders waiting to be filled
    levels: BTreeMap<i64, VecDeque<Order>>,
}

impl PriceLevels {
    /// Creates empty price levels for given side
    pub fn new(side: Side) -> Self {
        Self {
            side,
            levels: BTreeMap::new(),
        }
    }

    /// Adds an order at the price level, keep FIFO intact
    /// create price level if not existing
    pub fn push(&mut self, order: Order) {
        // Inserts order to price level, defaults to empty Queue if not
        self.levels
            .entry(order.px_ticks)
            .or_default()
            .push_back(order);
    }

    /// Returns all price levels with their orders
    pub fn get_price_levels(&self) -> &BTreeMap<i64, VecDeque<Order>> {
        &self.levels
    }

    /// Returns the best price for the side without removing anything
    /// For asks: the lowest price (whatever is first in the BTree)
    /// For bids: the highest price (whatever is last in the BTree)
    /// Returns None if no price levels currently exist
    pub fn best_price(&self) -> Option<i64> {
        match self.side {
            Side::Ask => self.levels.first_key_value().map(|(px, _)| *px),
            Side::Bid => self.levels.last_key_value().map(|(px, _)| *px),
        }
    }

    /// Returns how many orders are waiting at best price
    /// Returns 0 if no price levels currently
    pub fn best_level_size(&self) -> usize {
        match self.best_price() {
            Some(px) => self.levels.get(&px).map(|q| q.len()).unwrap_or(0),
            None => 0,
        }
    }

    /// Removes and retusn the queued order at the price
    /// Returns none for empty book
    /// Cleans up levels when queue is emptied
    pub fn pop_best(&mut self) -> Option<Order> {
        let px = self.best_price()?;
        let q = self.levels.get_mut(&px)?;
        let order = q.pop_front();
        if q.is_empty() {
            // remove the level if empty to keep balance and speed
            self.levels.remove(&px);
        }
        order
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Order, OrderId, Side};

    #[test]
    fn test_new_empty() {
        let bids = PriceLevels::new(Side::Bid);
        assert!(bids.levels.is_empty());
        let asks = PriceLevels::new(Side::Ask);
        assert!(asks.levels.is_empty());
    }

    #[test]
    fn test_push_keep_fifo() {
        let mut levels = PriceLevels::new(Side::Bid);

        // Same price, different timestamps (FIFO testing)
        let o1 = Order {
            id: OrderId(1),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 10,
            ts_ns: 1,
        };
        let o2 = Order {
            id: OrderId(2),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 20,
            ts_ns: 2,
        };
        let o3 = Order {
            id: OrderId(3),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 30,
            ts_ns: 3,
        };

        levels.push(o1.clone());
        levels.push(o2.clone());
        levels.push(o3.clone());

        let q = levels.levels.get(&10100).expect("price level exists");
        let ids: Vec<u128> = q.iter().map(|o| o.id.0).collect();
        assert_eq!(
            ids,
            vec![1, 2, 3],
            "FIFO must be preserved at a single price"
        );
    }

    #[test]
    fn best_level_size_zero_empty() {
        let bids = PriceLevels::new(Side::Bid);
        let asks = PriceLevels::new(Side::Ask);
        assert_eq!(bids.best_level_size(), 0);
        assert_eq!(asks.best_level_size(), 0);
    }

    #[test]
    fn best_level_size_counts_orders() {
        let mut asks = PriceLevels::new(Side::Ask);

        // Lowest best ask is 10200
        asks.push(Order {
            id: OrderId(1),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10200,
            qty: 10,
            ts_ns: 1,
        });

        // Higher price different time stamp
        asks.push(Order {
            id: OrderId(2),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10250,
            qty: 20,
            ts_ns: 2,
        });

        // Same idea
        asks.push(Order {
            id: OrderId(3),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10300,
            qty: 30,
            ts_ns: 3,
        });

        assert_eq!(asks.best_level_size(), 1);

        asks.push(Order {
            id: OrderId(4),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10200,
            qty: 40,
            ts_ns: 4,
        });

        assert_eq!(asks.best_level_size(), 2);
        assert_eq!(asks.best_price(), Some(10200));
    }

    #[test]
    fn best_level_size_counts_orders_ask() {
        let mut bids = PriceLevels::new(Side::Bid);

        bids.push(Order {
            id: OrderId(1),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 10,
            ts_ns: 1,
        });

        bids.push(Order {
            id: OrderId(2),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10050,
            qty: 20,
            ts_ns: 2,
        });

        assert_eq!(bids.best_level_size(), 1);

        bids.push(Order {
            id: OrderId(3),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 30,
            ts_ns: 3,
        });

        assert_eq!(bids.best_level_size(), 2);
        assert_eq!(bids.best_price(), Some(10100));
    }

    #[test]
    fn pop_best_empty() {
        let mut bids = PriceLevels::new(Side::Bid);
        assert!(bids.pop_best().is_none());
        let mut asks = PriceLevels::new(Side::Ask);
        assert!(asks.pop_best().is_none());
    }

    #[test]
    fn pop_best_removes_order_fifo_ask() {
        let mut asks = PriceLevels::new(Side::Ask);

        // orders at same price, diff stamps
        asks.push(Order {
            id: OrderId(1),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10200,
            qty: 10,
            ts_ns: 1,
        });

        asks.push(Order {
            id: OrderId(2),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10200,
            qty: 20,
            ts_ns: 2,
        });

        // add a worse order
        asks.push(Order {
            id: OrderId(3),
            symbol: "NVDA".into(),
            side: Side::Ask,
            px_ticks: 10300,
            qty: 30,
            ts_ns: 3,
        });

        // First pop
        let o = asks.pop_best().expect("order exists");
        assert_eq!(o.id.0, 1);
        assert_eq!(asks.best_price(), Some(10200));
        assert_eq!(asks.best_level_size(), 1);

        // Second pop, level was cleaned after prev call
        let o = asks.pop_best().expect("second best");
        assert_eq!(o.id.0, 2);
        assert_eq!(asks.best_price(), Some(10300));
        assert_eq!(asks.best_level_size(), 1);
    }

    #[test]
    fn pop_best_removes_order_fifo_bid() {
        let mut bids = PriceLevels::new(Side::Bid);

        // orders at same price, diff stamps
        bids.push(Order {
            id: OrderId(1),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10200,
            qty: 10,
            ts_ns: 1,
        });

        bids.push(Order {
            id: OrderId(2),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10200,
            qty: 20,
            ts_ns: 2,
        });

        // add a worse order
        bids.push(Order {
            id: OrderId(3),
            symbol: "NVDA".into(),
            side: Side::Bid,
            px_ticks: 10100,
            qty: 30,
            ts_ns: 3,
        });

        // First pop
        let o = bids.pop_best().expect("order exists");
        assert_eq!(o.id.0, 1);
        assert_eq!(bids.best_price(), Some(10200));
        assert_eq!(bids.best_level_size(), 1);

        // Second pop, level was cleaned after prev call
        let o = bids.pop_best().expect("second best");
        assert_eq!(o.id.0, 2);
        assert_eq!(bids.best_price(), Some(10100));
        assert_eq!(bids.best_level_size(), 1);
    }
}
// Use BTreeMap for balanced tree structure
// levels.keys().next() for lowest price
// levels.keys().next_back() for highest price
// O(1) access to price levels (ask or bid)
