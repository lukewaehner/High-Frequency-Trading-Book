//! HFT Ledger Performance Test Suite
//!
//! Runs performance tests followed by a basic trading demo showing
//! order placement, matching, and trade execution.

use orderbook::{OrderBook, Order, OrderId, Side};

mod latency_test;

/// Main entry point - runs performance tests and demo.
fn main() {
    println!("=== HFT Ledger Performance Lab ===");
    
    // Run comprehensive performance tests
    latency_test::run_latency_tests();
    latency_test::run_throughput_test();
    
    // Run 1-minute sustained throughput test
    println!("\n=== 1-Minute Sustained Throughput Test ===");
    latency_test::run_throughput_test_1min();
    
    // Show basic order book functionality
    println!("\n=== Basic Demo ===");
    run_basic_demo();
}

/// Demonstrates basic order book functionality with trade execution.
fn run_basic_demo() {
    let mut ob = OrderBook::new();
    
    println!("HFT Ledger - Order Book Demo");
    
    // Add ask order at $150.00
    let ask_order = Order {
        id: OrderId(1),
        symbol: "AAPL".to_string(),
        side: Side::Ask,
        px_ticks: 15000, // $150.00 in ticks
        qty: 100,
        ts_ns: 1_000_000_000,
    };
    
    // Add bid order at $149.50 (creates spread)
    let bid_order = Order {
        id: OrderId(2),
        symbol: "AAPL".to_string(),
        side: Side::Bid,
        px_ticks: 14950, // $149.50 in ticks
        qty: 50,
        ts_ns: 1_000_000_001,
    };
    
    println!("Submitting ask order: {} @ {}", ask_order.qty, ask_order.px_ticks);
    ob.submit_limit(ask_order);
    
    println!("Submitting bid order: {} @ {}", bid_order.qty, bid_order.px_ticks);
    ob.submit_limit(bid_order);
    
    println!("Best bid: {:?}", ob.best_bid());
    println!("Best ask: {:?}", ob.best_ask());
    
    // Crossing bid that will execute against the ask
    let crossing_bid = Order {
        id: OrderId(3),
        symbol: "AAPL".to_string(),
        side: Side::Bid,
        px_ticks: 15000, // Matches ask price
        qty: 75,         // Partial fill of ask order
        ts_ns: 1_000_000_002,
    };
    
    println!("Submitting crossing bid: {} @ {}", crossing_bid.qty, crossing_bid.px_ticks);
    let trades = ob.submit_limit(crossing_bid);
    
    println!("Trades executed: {}", trades.len());
    for trade in trades {
        println!("  Trade: {} shares @ {} ticks", trade.qty, trade.px_ticks);
        // Note: trade executes at maker's price (15000)
        // Maker: OrderId(1), Taker: OrderId(3)
    }
    
    println!("Final best bid: {:?}", ob.best_bid()); // Original bid remains
    println!("Final best ask: {:?}", ob.best_ask()); // 25 shares left of original ask
}
