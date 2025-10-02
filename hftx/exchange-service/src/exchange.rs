//! Exchange service core module providing multi-symbol order book management.
//!
//! This module implements a high-frequency trading exchange that manages multiple
//! order books concurrently using async/await patterns and concurrent data structures.
//! 
//! # Architecture
//! - Uses `DashMap` for lock-free concurrent access to symbol-specific order books
//! - Each order book is protected by an async `RwLock` for fine-grained locking
//! - Supports real-time order matching with price-time priority
//! - Designed for microsecond-level latency in order processing

use dashmap::DashMap;
use orderbook::{OrderBook, Order, OrderId, Side, Trade};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

use crate::types::{OrderBookState, MarketDepth, PriceLevel};

/// Core exchange engine managing multiple trading symbols concurrently.
///
/// The `Exchange` struct serves as the central hub for all trading operations,
/// maintaining separate order books for each trading symbol. It uses concurrent
/// data structures to handle high-frequency trading scenarios with minimal latency.
///
/// # Concurrency Model
/// - `DashMap`: Provides lock-free access to the symbol-to-orderbook mapping
/// - `RwLock<OrderBook>`: Allows multiple concurrent readers or exclusive writers per symbol
/// - This design enables parallel processing of orders across different symbols
/// while maintaining consistency within each symbol's order book
pub struct Exchange {
    /// Concurrent hashmap storing order books for each trading symbol.
    /// Key: Symbol string (e.g., "AAPL", "TSLA")
    /// Value: RwLock-protected OrderBook for thread-safe access
    orderbooks: DashMap<String, RwLock<OrderBook>>,
}

impl Exchange {
    /// Creates a new exchange instance with pre-populated default symbols.
    ///
    /// # Default Symbols
    /// Initializes with major tech stocks: AAPL, TSLA, MSFT, NVDA, GOOGL
    ///
    /// # Returns
    /// A new `Exchange` instance ready to handle trading operations
    pub fn new() -> Self {
        let exchange = Self {
            orderbooks: DashMap::new(),
        };
        
        // Pre-populate with high-volume tech stocks for demo purposes
        // In production, symbols would be loaded from a database or configuration
        exchange.orderbooks.insert("AAPL".to_string(), RwLock::new(OrderBook::new()));
        exchange.orderbooks.insert("TSLA".to_string(), RwLock::new(OrderBook::new()));
        exchange.orderbooks.insert("MSFT".to_string(), RwLock::new(OrderBook::new()));
        exchange.orderbooks.insert("NVDA".to_string(), RwLock::new(OrderBook::new()));
        exchange.orderbooks.insert("GOOGL".to_string(), RwLock::new(OrderBook::new()));
        
        exchange
    }

    /// Returns all trading symbols currently supported by the exchange.
    ///
    /// This operation is lock-free thanks to DashMap's concurrent iteration.
    /// The returned vector contains symbol strings in arbitrary order.
    ///
    /// # Returns
    /// Vector of symbol strings (e.g., ["AAPL", "TSLA", "MSFT"])
    pub async fn list_symbols(&self) -> Vec<String> {
        // DashMap::iter() provides a lock-free snapshot of all keys
        // Each entry represents a trading symbol with its associated order book
        self.orderbooks.iter().map(|entry| entry.key().clone()).collect()
    }

    /// Retrieves current order book state for a specific trading symbol.
    ///
    /// # Arguments
    /// * `symbol` - Trading symbol to query (e.g., "AAPL")
    ///
    /// # Returns
    /// * `Some(OrderBookState)` - Current state including best prices and level counts
    /// * `None` - If symbol doesn't exist on the exchange
    ///
    /// # Concurrency
    /// Uses read lock to allow concurrent access while preventing writes during state capture
    pub async fn get_orderbook_state(&self, symbol: &str) -> Option<OrderBookState> {
        // Attempt to get the order book for this symbol
        let orderbook_lock = self.orderbooks.get(symbol)?;
        
        // Acquire read lock - allows multiple concurrent readers
        // but blocks any writers until this operation completes
        let orderbook = orderbook_lock.read().await;
        
        // Count active price levels on each side
        // This gives us depth information without exposing internal structure
        let bid_levels = orderbook.bids.get_price_levels().len();
        let ask_levels = orderbook.asks.get_price_levels().len();
        
        // Capture current timestamp for state consistency tracking
        Some(OrderBookState {
            symbol: symbol.to_string(),
            best_bid: orderbook.best_bid(),  // Highest bid price
            best_ask: orderbook.best_ask(),  // Lowest ask price
            bid_levels,
            ask_levels,
            last_update: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
        })
    }

    /// Returns market depth for the specified symbol up to the requested number of levels.
    /// 
    /// # Arguments
    /// * `symbol` - Trading symbol to get depth for
    /// * `levels` - Maximum number of price levels to return for each side
    /// 
    /// # Returns
    /// * `Some(MarketDepth)` if symbol exists, `None` otherwise
    /// 
    /// Bids are ordered from highest to lowest price (best first).
    /// Asks are ordered from lowest to highest price (best first).
    /// Only price levels with quantity > 0 are included.
    pub async fn get_market_depth(&self, symbol: &str, levels: usize) -> Option<MarketDepth> {
        let orderbook_lock = self.orderbooks.get(symbol)?;
        let orderbook = orderbook_lock.read().await;
        
        let mut bids = Vec::new();
        let mut asks = Vec::new();
        
        // Process bid side: highest prices first (best bids)
        let bid_iter = orderbook.bids.iter_levels_best_first();
        for (price, qty) in bid_iter.take(levels) {
            if qty > 0 {  // Only include levels with actual quantity
                // Count individual orders at this price level
                let orders = orderbook.bids.get_price_levels()
                    .get(&price)
                    .map(|q| q.len())
                    .unwrap_or(0);
                
                bids.push(PriceLevel {
                    price,
                    quantity: qty,
                    orders,
                });
            }
        }
        
        // Process ask side: lowest prices first (best asks)
        let ask_iter = orderbook.asks.iter_levels_best_first();
        for (price, qty) in ask_iter.take(levels) {
            if qty > 0 {  // Only include levels with actual quantity
                let orders = orderbook.asks.get_price_levels()
                    .get(&price)
                    .map(|q| q.len())
                    .unwrap_or(0);
                
                asks.push(PriceLevel {
                    price,
                    quantity: qty,
                    orders,
                });
            }
        }
        
        Some(MarketDepth {
            symbol: symbol.to_string(),
            bids,
            asks,
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
        })
    }

    /// Submits a limit order to the specified symbol's order book.
    ///
    /// # Arguments
    /// * `symbol` - Trading symbol for the order
    /// * `order` - Complete order details including price, quantity, and side
    ///
    /// # Returns
    /// * `Some(Vec<Trade>)` - Vector of trades executed immediately (if any)
    /// * `None` - If symbol doesn't exist
    ///
    /// # Order Processing
    /// 1. Acquires write lock for exclusive access to the order book
    /// 2. Attempts to match against existing orders using price-time priority
    /// 3. Returns any trades that executed immediately
    /// 4. Remaining unfilled quantity stays in the book as a resting order
    pub async fn submit_order(&self, symbol: String, order: Order) -> Option<Vec<Trade>> {
        let orderbook_lock = self.orderbooks.get(&symbol)?;
        
        // Acquire write lock for exclusive access during order processing
        // This ensures atomic order matching and book updates
        let mut orderbook = orderbook_lock.write().await;
        
        // Submit limit order - may result in immediate trades
        // The order book handles price-time priority matching automatically
        let trades = orderbook.submit_limit(order);
        Some(trades)
    }

    /// Cancels an existing order from the specified symbol's order book.
    ///
    /// # Arguments
    /// * `symbol` - Trading symbol containing the order
    /// * `order_id` - Unique identifier of the order to cancel
    ///
    /// # Returns
    /// * `Some(true)` - Order was found and cancelled successfully
    /// * `Some(false)` - Order was not found (may have already filled/cancelled)
    /// * `None` - Symbol doesn't exist
    ///
    /// # Implementation Notes
    /// Searches both bid and ask sides since we don't know the order's side a priori.
    /// This is more efficient than requiring the client to specify the side.
    pub async fn cancel_order(&self, symbol: &str, order_id: OrderId) -> Option<bool> {
        let orderbook_lock = self.orderbooks.get(symbol)?;
        
        // Acquire write lock since cancellation modifies the order book
        let mut orderbook = orderbook_lock.write().await;
        
        // Search both sides since we don't know which side the order is on
        // This avoids requiring the client to track order side information
        let cancelled_from_bids = orderbook.bids.cancel(order_id);
        let cancelled_from_asks = orderbook.asks.cancel(order_id);
        
        // Return true if cancelled from either side
        Some(cancelled_from_bids || cancelled_from_asks)
    }

    /// Retrieves the current best bid and ask prices for a symbol.
    ///
    /// # Arguments
    /// * `symbol` - Trading symbol to query
    ///
    /// # Returns
    /// * `Some((bid, ask))` - Tuple of optional prices (None if no orders on that side)
    /// * `None` - If symbol doesn't exist
    ///
    /// # Use Cases
    /// - Market data feeds
    /// - Spread calculations
    /// - Order validation (ensuring orders are reasonably priced)
    pub async fn get_best_prices(&self, symbol: &str) -> Option<(Option<i64>, Option<i64>)> {
        let orderbook_lock = self.orderbooks.get(symbol)?;
        
        // Read lock allows concurrent access to price information
        let orderbook = orderbook_lock.read().await;
        
        // Return tuple of (best_bid, best_ask)
        // Either or both may be None if no orders exist on that side
        Some((orderbook.best_bid(), orderbook.best_ask()))
    }

    /// Adds a new trading symbol to the exchange.
    ///
    /// # Arguments
    /// * `symbol` - New symbol to add (e.g., "AMZN")
    ///
    /// # Implementation Notes
    /// Creates a fresh, empty order book for the new symbol.
    /// If symbol already exists, this will replace the existing order book
    /// (effectively clearing all orders - use with caution in production).
    pub async fn add_symbol(&self, symbol: String) {
        // Insert new order book for this symbol
        // DashMap::insert is atomic and thread-safe
        self.orderbooks.insert(symbol, RwLock::new(OrderBook::new()));
    }
    
    /// Returns the total number of active orders on each side for a symbol.
    ///
    /// # Arguments
    /// * `symbol` - Trading symbol to query
    ///
    /// # Returns
    /// * `Some((bid_count, ask_count))` - Number of active orders on each side
    /// * `None` - If symbol doesn't exist
    ///
    /// # Use Cases
    /// - Market depth analysis
    /// - Liquidity assessment
    /// - Exchange statistics and monitoring
    pub async fn get_total_volume(&self, symbol: &str) -> Option<(i64, i64)> {
        let orderbook_lock = self.orderbooks.get(symbol)?;
        
        // Read lock for concurrent access to order counts
        let orderbook = orderbook_lock.read().await;
        
        // Count active orders (excluding cancelled orders)
        let bid_volume = orderbook.bids.total_len() as i64;
        let ask_volume = orderbook.asks.total_len() as i64;
        
        Some((bid_volume, ask_volume))
    }
} 