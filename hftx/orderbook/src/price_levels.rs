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
            .or_insert_with(VecDeque::new)
            .push_back(order);
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
}
// Use BTreeMap for balanced tree structure
// levels.keys().next() for lowest price
// levels.keys().next_back() for highest price
// O(1) access to price levels (ask or bid)
