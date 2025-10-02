use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use orderbook::{OrderBook, Order, OrderId, Side};
use std::time::{SystemTime, UNIX_EPOCH};

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

fn bench_order_submission(c: &mut Criterion) {
    let mut group = c.benchmark_group("order_submission");
    
    for &num_orders in [100, 1000, 10000].iter() {
        group.bench_with_input(
            BenchmarkId::new("non_crossing_orders", num_orders),
            &num_orders,
            |b, &num_orders| {
                b.iter(|| {
                    let mut ob = OrderBook::new();
                    for i in 0..num_orders {
                        let order = create_order(
                            i as u128,
                            "AAPL",
                            if i % 2 == 0 { Side::Bid } else { Side::Ask },
                            if i % 2 == 0 { 10000 - (i as i64) } else { 10100 + (i as i64) },
                            100,
                        );
                        black_box(ob.submit_limit(order));
                    }
                })
            },
        );
    }
    
    group.finish();
}

fn bench_order_matching(c: &mut Criterion) {
    let mut group = c.benchmark_group("order_matching");
    
    for &depth in [10, 100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::new("crossing_orders", depth),
            &depth,
            |b, &depth| {
                b.iter_batched(
                    || {
                        let mut ob = OrderBook::new();
                        // Pre-populate with resting orders
                        for i in 0..depth {
                            // Add asks at increasing prices
                            let ask = create_order(
                                i as u128,
                                "AAPL",
                                Side::Ask,
                                10000 + i as i64,
                                100,
                            );
                            ob.submit_limit(ask);
                            
                            // Add bids at decreasing prices
                            let bid = create_order(
                                (i + depth) as u128,
                                "AAPL",
                                Side::Bid,
                                9999 - i as i64,
                                100,
                            );
                            ob.submit_limit(bid);
                        }
                        ob
                    },
                    |mut ob| {
                        // Submit a large crossing order
                        let crossing_order = create_order(
                            (depth * 2) as u128,
                            "AAPL",
                            Side::Bid,
                            10000 + depth as i64,
                            (depth * 50) as i64,
                        );
                        black_box(ob.submit_limit(crossing_order))
                    },
                    criterion::BatchSize::SmallInput,
                )
            },
        );
    }
    
    group.finish();
}

fn bench_market_data_access(c: &mut Criterion) {
    let mut group = c.benchmark_group("market_data");
    
    // Create a populated order book
    let mut ob = OrderBook::new();
    for i in 0..1000 {
        let ask = create_order(i, "AAPL", Side::Ask, 10000 + (i as i64), 100);
        ob.submit_limit(ask);
        let bid = create_order(i + 1000, "AAPL", Side::Bid, 9999 - (i as i64), 100);
        ob.submit_limit(bid);
    }
    
    group.bench_function("best_bid", |b| {
        b.iter(|| black_box(ob.best_bid()))
    });
    
    group.bench_function("best_ask", |b| {
        b.iter(|| black_box(ob.best_ask()))
    });
    
    group.finish();
}

fn bench_price_levels_operations(c: &mut Criterion) {
    let mut group = c.benchmark_group("price_levels");
    
    // Create populated price levels
    let mut bids = orderbook::PriceLevels::new(Side::Bid);
    let mut asks = orderbook::PriceLevels::new(Side::Ask);
    
    for i in 0..1000 {
        let bid_order = create_order(i, "AAPL", Side::Bid, 9999 - (i as i64), 100);
        let ask_order = create_order(i + 1000, "AAPL", Side::Ask, 10000 + (i as i64), 100);
        bids.push(bid_order);
        asks.push(ask_order);
    }
    
    group.bench_function("best_price_bid", |b| {
        b.iter(|| black_box(bids.best_price()))
    });
    
    group.bench_function("best_price_ask", |b| {
        b.iter(|| black_box(asks.best_price()))
    });
    
    group.bench_function("total_len_bid", |b| {
        b.iter(|| black_box(bids.total_len()))
    });
    
    group.bench_function("qty_at_price", |b| {
        b.iter(|| black_box(bids.qty_at_price(9500)))
    });
    
    group.bench_function("peek_best", |b| {
        b.iter(|| black_box(bids.peek_best()))
    });
    
    group.finish();
}

fn bench_order_cancellation(c: &mut Criterion) {
    let mut group = c.benchmark_group("cancellation");
    
    for &num_orders in [100, 1000].iter() {
        group.bench_with_input(
            BenchmarkId::new("lazy_cancel", num_orders),
            &num_orders,
            |b, &num_orders| {
                b.iter_batched(
                    || {
                        let mut bids = orderbook::PriceLevels::new(Side::Bid);
                        let mut order_ids = Vec::new();
                        for i in 0..num_orders {
                            let order = create_order(i as u128, "AAPL", Side::Bid, 10000, 100);
                            order_ids.push(order.id);
                            bids.push(order);
                        }
                        (bids, order_ids)
                    },
                    |(mut bids, order_ids)| {
                        // Cancel every other order
                        for (i, &order_id) in order_ids.iter().enumerate() {
                            if i % 2 == 0 {
                                black_box(bids.cancel(order_id));
                            }
                        }
                        // Pop orders to trigger lazy removal
                        while bids.pop_best().is_some() {}
                    },
                    criterion::BatchSize::SmallInput,
                )
            },
        );
        
        group.bench_with_input(
            BenchmarkId::new("eager_remove", num_orders),
            &num_orders,
            |b, &num_orders| {
                b.iter_batched(
                    || {
                        let mut bids = orderbook::PriceLevels::new(Side::Bid);
                        let mut order_ids = Vec::new();
                        for i in 0..num_orders {
                            let order = create_order(i as u128, "AAPL", Side::Bid, 10000, 100);
                            order_ids.push(order.id);
                            bids.push(order);
                        }
                        (bids, order_ids)
                    },
                    |(mut bids, order_ids)| {
                        // Remove every other order eagerly
                        for (i, &order_id) in order_ids.iter().enumerate() {
                            if i % 2 == 0 {
                                black_box(bids.remove(order_id));
                            }
                        }
                    },
                    criterion::BatchSize::SmallInput,
                )
            },
        );
    }
    
    group.finish();
}

fn bench_high_frequency_scenario(c: &mut Criterion) {
    let mut group = c.benchmark_group("hft_scenario");
    
    group.bench_function("rapid_order_flow", |b| {
        b.iter(|| {
            let mut ob = OrderBook::new();
            let mut order_id = 1u128;
            
            // Simulate rapid order flow: submit, match, cancel pattern
            for _ in 0..100 {
                // Add some resting orders
                for i in 0..5 {
                    let ask = create_order(order_id, "AAPL", Side::Ask, 10000 + i, 100);
                    order_id += 1;
                    ob.submit_limit(ask);
                    
                    let bid = create_order(order_id, "AAPL", Side::Bid, 9999 - i, 100);
                    order_id += 1;
                    ob.submit_limit(bid);
                }
                
                // Submit crossing orders
                let crossing = create_order(order_id, "AAPL", Side::Bid, 10002, 300);
                order_id += 1;
                black_box(ob.submit_limit(crossing));
                
                // Check market data
                black_box(ob.best_bid());
                black_box(ob.best_ask());
            }
        })
    });
    
    group.finish();
}

criterion_group!(
    benches,
    bench_order_submission,
    bench_order_matching,
    bench_market_data_access,
    bench_price_levels_operations,
    bench_order_cancellation,
    bench_high_frequency_scenario
);

criterion_main!(benches);
