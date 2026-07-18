//! Server-side bot driver: spawns a tokio task per symbol that synthesizes
//! maker/taker orders and feeds them straight into the in-process exchange,
//! bypassing the HTTP layer. Per-order engine latency is broadcast on a
//! dedicated channel so the browser histogram still has data when the server
//! is the load source.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use orderbook::{Order, OrderId, Side};
use tokio::sync::{broadcast, watch, Mutex};
use tokio::time::interval;
use tracing::{info, warn};

use crate::exchange::Exchange;
use crate::types::{BotConfig, LatencySample, SimStatusEntry, TradeEvent};

const SEED_MID_TICKS: i64 = 18_750;

struct DriverHandle {
    config: BotConfig,
    cancel_tx: watch::Sender<bool>,
}

/// Coordinates one bot task per symbol. Cheap to clone — internals are shared.
#[derive(Clone)]
pub struct BotDriver {
    exchange: Arc<Exchange>,
    trade_tx: broadcast::Sender<TradeEvent>,
    latency_tx: broadcast::Sender<LatencySample>,
    drivers: Arc<Mutex<HashMap<String, DriverHandle>>>,
}

impl BotDriver {
    pub fn new(
        exchange: Arc<Exchange>,
        trade_tx: broadcast::Sender<TradeEvent>,
        latency_tx: broadcast::Sender<LatencySample>,
    ) -> Self {
        Self {
            exchange,
            trade_tx,
            latency_tx,
            drivers: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Returns the broadcast handle so handlers can `subscribe()`.
    pub fn latency_sender(&self) -> broadcast::Sender<LatencySample> {
        self.latency_tx.clone()
    }

    /// Starts (or replaces) the driver for `config.symbol`. Idempotent.
    pub async fn start(&self, config: BotConfig) {
        let mut drivers = self.drivers.lock().await;

        if let Some(existing) = drivers.remove(&config.symbol) {
            let _ = existing.cancel_tx.send(true);
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let symbol = config.symbol.clone();
        let cfg = config.clone();
        let exchange = self.exchange.clone();
        let trade_tx = self.trade_tx.clone();
        let latency_tx = self.latency_tx.clone();

        tokio::spawn(async move {
            run_driver(exchange, trade_tx, latency_tx, cfg, cancel_rx).await;
        });

        drivers.insert(
            symbol.clone(),
            DriverHandle {
                config,
                cancel_tx,
            },
        );

        info!("bot_driver: started for {}", symbol);
    }

    /// Cancels the driver for `symbol`. No-op if none is running.
    pub async fn stop(&self, symbol: &str) -> bool {
        let mut drivers = self.drivers.lock().await;
        if let Some(handle) = drivers.remove(symbol) {
            let _ = handle.cancel_tx.send(true);
            info!("bot_driver: stopped for {}", symbol);
            true
        } else {
            false
        }
    }

    /// Snapshot of all currently running drivers.
    pub async fn status(&self) -> Vec<SimStatusEntry> {
        let drivers = self.drivers.lock().await;
        drivers
            .values()
            .map(|h| SimStatusEntry {
                symbol: h.config.symbol.clone(),
                running: true,
                config: h.config.clone(),
            })
            .collect()
    }
}

async fn run_driver(
    exchange: Arc<Exchange>,
    trade_tx: broadcast::Sender<TradeEvent>,
    latency_tx: broadcast::Sender<LatencySample>,
    config: BotConfig,
    mut cancel_rx: watch::Receiver<bool>,
) {
    let symbol = config.symbol.clone();
    let mut tick = interval(Duration::from_millis(config.tick_ms.max(1)));
    let mut rng = XorShiftRng::seed();

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() {
                    break;
                }
            }
            _ = tick.tick() => {
                let (best_bid, best_ask) = exchange
                    .get_best_prices(&symbol)
                    .await
                    .unwrap_or((None, None));

                let reference_mid = match (best_bid, best_ask) {
                    (Some(b), Some(a)) => (b + a) / 2,
                    _ => SEED_MID_TICKS,
                };
                let aggr = (config.aggression as f64 / 100.0).clamp(0.0, 1.0);

                let total = (config.makers + config.takers) as usize;
                if total == 0 {
                    continue;
                }
                let mut orders = Vec::with_capacity(total);

                for _ in 0..config.makers {
                    let half_spread =
                        (8.0 - aggr * 6.0 + rng.next_f64() * 5.0).round().max(1.0) as i64;
                    let offset = (rng.next_f64() * half_spread as f64).round() as i64;
                    let side = if rng.next_f64() < 0.5 { Side::Bid } else { Side::Ask };
                    let price = match side {
                        Side::Bid => reference_mid - offset,
                        Side::Ask => reference_mid + offset,
                    };
                    let qty = 10 + (rng.next_f64() * 80.0) as i64;
                    orders.push(make_order(&symbol, side, price, qty));
                }

                for _ in 0..config.takers {
                    let will_cross = rng.next_f64() < 0.35 + aggr * 0.55;
                    let side = if rng.next_f64() < 0.5 { Side::Bid } else { Side::Ask };
                    let price = if will_cross {
                        match side {
                            Side::Bid => {
                                let base = best_ask.unwrap_or(reference_mid + 4);
                                base + (rng.next_f64() * 4.0).round() as i64
                            }
                            Side::Ask => {
                                let base = best_bid.unwrap_or(reference_mid - 4);
                                base - (rng.next_f64() * 4.0).round() as i64
                            }
                        }
                    } else {
                        match side {
                            Side::Bid => best_bid.unwrap_or(reference_mid - 1),
                            Side::Ask => best_ask.unwrap_or(reference_mid + 1),
                        }
                    };
                    let qty = 5 + (rng.next_f64() * 50.0) as i64;
                    orders.push(make_order(&symbol, side, price, qty));
                }

                let Some(per_order) = exchange.submit_order_batch(&symbol, orders).await else {
                    warn!("bot_driver: symbol {} disappeared mid-run", symbol);
                    break;
                };

                let now_ms = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                for (trades, latency_ns) in per_order {
                    let filled = !trades.is_empty();
                    for trade in trades {
                        let _ = trade_tx.send(TradeEvent {
                            symbol: symbol.clone(),
                            trade,
                            timestamp: now_ms,
                        });
                    }
                    let _ = latency_tx.send(LatencySample {
                        latency_ns: latency_ns as u64,
                        filled,
                        ts_ms: now_ms,
                    });
                }
            }
        }
    }

    info!("bot_driver: task exited for {}", symbol);
}

fn make_order(symbol: &str, side: Side, price: i64, qty: i64) -> Order {
    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    Order::limit(OrderId(uuid::Uuid::new_v4().as_u128()), symbol, side, price, qty, now_ns)
}

struct XorShiftRng(u64);

impl XorShiftRng {
    fn seed() -> Self {
        let s = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E37_79B9_7F4A_7C15)
            ^ 0xDEAD_BEEF_CAFE_BABE;
        Self(s | 1)
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}
