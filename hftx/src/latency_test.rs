//! Performance testing suite for the order book.
//!
//! Measures latency and throughput under various scenarios:
//! - Market data access, order submission, matching, cancellation
//! - Sustained throughput testing with mixed workloads
//! - Statistical analysis with multiple iterations

use orderbook::{OrderBook, Order, OrderId, Side};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Runs complete latency test suite.
pub fn run_latency_tests() {
    println!(" HFT Ledger - Real-time Latency Tests\n");
    
    test_market_data_latency();
    test_order_submission_latency();
    test_order_matching_latency();
    test_cancellation_latency();
}

/// Creates test order with current timestamp.
fn create_order(id: u128, symbol: &str, side: Side, price: i64, qty: i64) -> Order {
    Order {
        id: OrderId(id),
        symbol: symbol.to_string(),
        side,
        px_ticks: price,
        qty,
        ts_ns: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos(),
    }
}

/// Tests best bid/ask lookup performance.
fn test_market_data_latency() {
    println!(" Market Data Latency Test");
    
    let mut ob = OrderBook::new();
    
    // Populate with 100 orders per side
    for i in 0..100 {
        let ask = create_order(i, "AAPL", Side::Ask, 10000 + i as i64, 100);
        ob.submit_limit(ask);
        let bid = create_order(i + 100, "AAPL", Side::Bid, 9999 - i as i64, 100);
        ob.submit_limit(bid);
    }
    
    let iterations = 1_000_000;
    
    let start = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(ob.best_bid());
    }
    let bid_duration = start.elapsed();
    
    let start = Instant::now();
    for _ in 0..iterations {
        std::hint::black_box(ob.best_ask());
    }
    let ask_duration = start.elapsed();
    
    println!("  Best bid lookup: {:.2} ns/call", bid_duration.as_nanos() as f64 / iterations as f64);
    println!("  Best ask lookup: {:.2} ns/call", ask_duration.as_nanos() as f64 / iterations as f64);
    println!("  Combined latency: {:.2} ns\n", (bid_duration.as_nanos() + ask_duration.as_nanos()) as f64 / iterations as f64);
}

/// Tests order submission latency for non-crossing orders.
fn test_order_submission_latency() {
    println!(" Order Submission Latency Test");
    
    let iterations = 10_000;
    let mut total_time = 0u128;
    
    for i in 0..iterations {
        let mut ob = OrderBook::new();
        let order = create_order(i, "AAPL", Side::Bid, 10000 - i as i64, 100);
        
        let start = Instant::now();
        ob.submit_limit(order);
        total_time += start.elapsed().as_nanos();
    }
    
    let avg_latency = total_time as f64 / iterations as f64;
    println!("  Average order submission: {:.2} ns", avg_latency);
    println!("  Throughput: {:.0} orders/second\n", 1_000_000_000.0 / avg_latency);
}

/// Tests order matching latency for crossing orders.
fn test_order_matching_latency() {
    println!(" Order Matching Latency Test");
    
    let iterations = 1_000;
    let mut total_setup_time = 0u128;
    let mut total_match_time = 0u128;
    
    for i in 0..iterations {
        let setup_start = Instant::now();
        let mut ob = OrderBook::new();
        
        // Add 10 resting ask orders
        for j in 0..10 {
            let ask = create_order(j, "AAPL", Side::Ask, 10000 + j as i64, 100);
            ob.submit_limit(ask);
        }
        total_setup_time += setup_start.elapsed().as_nanos();
        
        // Crossing bid that matches multiple levels
        let crossing_order = create_order(1000 + i, "AAPL", Side::Bid, 10005, 500);
        
        let match_start = Instant::now();
        let trades = ob.submit_limit(crossing_order);
        total_match_time += match_start.elapsed().as_nanos();
        
        std::hint::black_box(trades);
    }
    
    println!("  Setup (10 resting orders): {:.2} ns", total_setup_time as f64 / iterations as f64);
    println!("  Crossing order execution: {:.2} ns", total_match_time as f64 / iterations as f64);
    println!("  Total order-to-trade: {:.2} ns\n", (total_setup_time + total_match_time) as f64 / iterations as f64);
}

/// Compares lazy vs eager cancellation performance.
fn test_cancellation_latency() {
    println!(" Cancellation Latency Test");
    
    let iterations = 1_000;
    let orders_per_test = 100;
    
    // Test lazy cancellation (mark as cancelled)
    let mut total_lazy_time = 0u128;
    for i in 0..iterations {
        let mut bids = orderbook::PriceLevels::new(Side::Bid);
        let mut order_ids = Vec::new();
        
        for j in 0..orders_per_test {
            let order = create_order((i * orders_per_test + j) as u128, "AAPL", Side::Bid, 10000, 100);
            order_ids.push(order.id);
            bids.push(order);
        }
        
        let start = Instant::now();
        // Cancel 50% of orders lazily
        for (idx, &order_id) in order_ids.iter().enumerate() {
            if idx % 2 == 0 {
                bids.cancel(order_id); // O(1) operation
            }
        }
        total_lazy_time += start.elapsed().as_nanos();
    }
    
    // Test eager removal (immediate removal)
    let mut total_eager_time = 0u128;
    for i in 0..iterations {
        let mut bids = orderbook::PriceLevels::new(Side::Bid);
        let mut order_ids = Vec::new();
        
        for j in 0..orders_per_test {
            let order = create_order((i * orders_per_test + j + 1_000_000) as u128, "AAPL", Side::Bid, 10000, 100);
            order_ids.push(order.id);
            bids.push(order);
        }
        
        let start = Instant::now();
        // Remove 50% of orders eagerly
        for (idx, &order_id) in order_ids.iter().enumerate() {
            if idx % 2 == 0 {
                bids.remove(order_id); // O(n) operation
            }
        }
        total_eager_time += start.elapsed().as_nanos();
    }
    
    println!("  Lazy cancellation: {:.2} ns per order", total_lazy_time as f64 / (iterations * orders_per_test / 2) as f64);
    println!("  Eager removal: {:.2} ns per order", total_eager_time as f64 / (iterations * orders_per_test / 2) as f64);
    println!("  Lazy is {:.1}x faster\n", total_eager_time as f64 / total_lazy_time as f64);
}

/// Runs sustained throughput test with mixed workload.
pub fn run_throughput_test() {
    println!(" Sustained Throughput Test (10 seconds)");
    
    let mut ob = OrderBook::new();
    let mut order_id = 1u128;
    let mut orders_processed = 0u64;
    let mut trades_executed = 0u64;
    
    let start_time = Instant::now();
    let duration = std::time::Duration::from_secs(10);
    
    while start_time.elapsed() < duration {
        // Mix of order types: 25% each of non-crossing bids/asks, crossing bids/asks
        match order_id % 4 {
            0 => {
                // Non-crossing bid
                let order = create_order(order_id, "AAPL", Side::Bid, 9999 - (order_id % 100) as i64, 100);
                ob.submit_limit(order);
            }
            1 => {
                // Non-crossing ask
                let order = create_order(order_id, "AAPL", Side::Ask, 10001 + (order_id % 100) as i64, 100);
                ob.submit_limit(order);
            }
            2 => {
                // Crossing bid
                let order = create_order(order_id, "AAPL", Side::Bid, 10001, 50);
                let trades = ob.submit_limit(order);
                trades_executed += trades.len() as u64;
            }
            3 => {
                // Crossing ask
                let order = create_order(order_id, "AAPL", Side::Ask, 9999, 50);
                let trades = ob.submit_limit(order);
                trades_executed += trades.len() as u64;
            }
            _ => unreachable!(),
        }
        
        order_id += 1;
        orders_processed += 1;
        
        // Periodic market data queries (every 100 orders)
        if order_id % 100 == 0 {
            std::hint::black_box(ob.best_bid());
            std::hint::black_box(ob.best_ask());
        }
    }
    
    let elapsed = start_time.elapsed();
    let orders_per_sec = orders_processed as f64 / elapsed.as_secs_f64();
    let trades_per_sec = trades_executed as f64 / elapsed.as_secs_f64();
    
    println!("  Duration: {:.1} seconds", elapsed.as_secs_f64());
    println!("  Orders processed: {}", orders_processed);
    println!("  Trades executed: {}", trades_executed);
    println!("  Order throughput: {:.0} orders/second", orders_per_sec);
    println!("  Trade throughput: {:.0} trades/second", trades_per_sec);
    println!("  Final book state: bid={:?}, ask={:?}", ob.best_bid(), ob.best_ask());
} 
/// Runs 1-minute sustained throughput test with mixed workload.
pub fn run_throughput_test_1min() {
    println!(" Sustained Throughput Test (60 seconds)");
    
    let mut ob = OrderBook::new();
    let mut order_id = 1u128;
    let mut orders_processed = 0u64;
    let mut trades_executed = 0u64;
    
    let start_time = Instant::now();
    let duration = std::time::Duration::from_secs(60);
    
    while start_time.elapsed() < duration {
        // Mix of order types: 25% each of non-crossing bids/asks, crossing bids/asks
        match order_id % 4 {
            0 => {
                // Non-crossing bid
                let order = create_order(order_id, "AAPL", Side::Bid, 9999 - (order_id % 100) as i64, 100);
                ob.submit_limit(order);
            }
            1 => {
                // Non-crossing ask
                let order = create_order(order_id, "AAPL", Side::Ask, 10001 + (order_id % 100) as i64, 100);
                ob.submit_limit(order);
            }
            2 => {
                // Crossing bid
                let order = create_order(order_id, "AAPL", Side::Bid, 10001, 50);
                let trades = ob.submit_limit(order);
                trades_executed += trades.len() as u64;
            }
            3 => {
                // Crossing ask
                let order = create_order(order_id, "AAPL", Side::Ask, 9999, 50);
                let trades = ob.submit_limit(order);
                trades_executed += trades.len() as u64;
            }
            _ => unreachable!(),
        }
        
        order_id += 1;
        orders_processed += 1;
        
        // Periodic market data queries (every 100 orders)
        if order_id % 100 == 0 {
            std::hint::black_box(ob.best_bid());
            std::hint::black_box(ob.best_ask());
        }
    }
    
    let elapsed = start_time.elapsed();
    let orders_per_sec = orders_processed as f64 / elapsed.as_secs_f64();
    let trades_per_sec = trades_executed as f64 / elapsed.as_secs_f64();
    
    println!("  Duration: {:.1} seconds", elapsed.as_secs_f64());
    println!("  Orders processed: {}", orders_processed);
    println!("  Trades executed: {}", trades_executed);
    println!("  Order throughput: {:.0} orders/second", orders_per_sec);
    println!("  Trade throughput: {:.0} trades/second", trades_per_sec);
    println!("  Final book state: bid={:?}, ask={:?}", ob.best_bid(), ob.best_ask());
}
