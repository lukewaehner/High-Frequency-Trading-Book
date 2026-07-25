//! WebSocket handlers for real-time market data streaming.
//!
//! Provides live trade execution and market depth updates via WebSocket connections.
//! Uses tokio::select! for concurrent handling of messages, broadcasts, and heartbeats.

use axum::extract::ws::{Message, WebSocket};
use futures::{sink::SinkExt, stream::StreamExt};
use orderbook::{Order, OrderId, OrderKind};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;
use tokio::time::interval;
use tracing::{error, info, warn};

use crate::{types::*, AppState};

/// Handles real-time trade streaming for a symbol.
/// 
/// Streams trade executions immediately as they occur. Includes ping/pong
/// heartbeat for connection health monitoring.
pub async fn handle_trade_stream(socket: WebSocket, symbol: String, state: AppState) {
    info!("New trade stream connection for {}", symbol);
    
    let (mut sender, mut receiver) = socket.split();
    let mut trade_rx = state.trade_broadcaster.subscribe();
    let mut ping_interval = interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            // Handle incoming WebSocket messages
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WebSocketMessage>(&text) {
                            match ws_msg {
                                WebSocketMessage::Ping { timestamp } => {
                                    let pong = WebSocketMessage::Pong { timestamp };
                                    if let Ok(pong_json) = serde_json::to_string(&pong) {
                                        let _ = sender.send(Message::Text(pong_json)).await;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {} // Ignore binary
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Pong(_))) => {} // Ignore pong
                    Some(Ok(Message::Close(_))) => {
                        info!(" Trade stream connection closed for {}", symbol);
                        break;
                    }
                    Some(Err(e)) => {
                        error!(" WebSocket error in trade stream: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            
            // Forward trade broadcasts for this symbol
            trade_result = trade_rx.recv() => {
                match trade_result {
                    Ok(trade_event) => {
                        if trade_event.symbol == symbol {
                            let ws_msg = WebSocketMessage::Trade(trade_event);
                            if let Ok(json) = serde_json::to_string(&ws_msg) {
                                if sender.send(Message::Text(json)).await.is_err() {
                                    warn!(" Failed to send trade update for {}", symbol);
                                    break;
                                }
                            }
                        }
                    }
                    Err(_) => break, // Channel closed/lagged
                }
            }
            
            // Send periodic heartbeat pings
            _ = ping_interval.tick() => {
                let ping = WebSocketMessage::Ping {
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64
                };
                if let Ok(ping_json) = serde_json::to_string(&ping) {
                    if sender.send(Message::Text(ping_json)).await.is_err() {
                        break; // Connection broken
                    }
                }
            }
        }
    }
    
    info!("Trade stream handler ended for {}", symbol);
}

/// Handles real-time market depth streaming for a symbol.
/// 
/// Sends depth updates at 10 Hz (every 100ms) but only when prices change.
/// Includes initial snapshot on connection.
pub async fn handle_depth_stream(socket: WebSocket, symbol: String, state: AppState) {
    info!("New depth stream connection for {}", symbol);
    
    let (mut sender, mut receiver) = socket.split();
    let mut update_interval = interval(Duration::from_millis(100)); // 10 Hz
    let mut ping_interval = interval(Duration::from_secs(30));
    
    // Send initial depth snapshot
    if let Some(depth) = state.exchange.get_market_depth(&symbol, 10).await {
        let depth_update = DepthUpdate {
            symbol: symbol.clone(),
            best_bid: depth.bids.first().map(|b| b.price),
            best_ask: depth.asks.first().map(|a| a.price),
            bid_size: depth.bids.first().map(|b| b.quantity).unwrap_or(0),
            ask_size: depth.asks.first().map(|a| a.quantity).unwrap_or(0),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64,
        };
        
        let ws_msg = WebSocketMessage::Depth(depth_update);
        if let Ok(json) = serde_json::to_string(&ws_msg) {
            let _ = sender.send(Message::Text(json)).await;
        }
    }

    // Track last sent prices to avoid redundant updates
    let mut last_best_bid: Option<i64> = None;
    let mut last_best_ask: Option<i64> = None;

    loop {
        tokio::select! {
            // Handle incoming messages
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WebSocketMessage>(&text) {
                            match ws_msg {
                                WebSocketMessage::Ping { timestamp } => {
                                    let pong = WebSocketMessage::Pong { timestamp };
                                    if let Ok(pong_json) = serde_json::to_string(&pong) {
                                        let _ = sender.send(Message::Text(pong_json)).await;
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {} // Ignore
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Pong(_))) => {} // Ignore
                    Some(Ok(Message::Close(_))) => {
                        info!(" Depth stream connection closed for {}", symbol);
                        break;
                    }
                    Some(Err(e)) => {
                        error!(" WebSocket error in depth stream: {}", e);
                        break;
                    }
                    None => break,
                }
            }
            
            // Send depth updates only when prices change
            _ = update_interval.tick() => {
                if let Some((best_bid, best_ask)) = state.exchange.get_best_prices(&symbol).await {
                    if best_bid != last_best_bid || best_ask != last_best_ask {
                        let (bid_volume, ask_volume) = state.exchange
                            .get_total_volume(&symbol)
                            .await
                            .unwrap_or((0, 0));
                        
                        let depth_update = DepthUpdate {
                            symbol: symbol.clone(),
                            best_bid,
                            best_ask,
                            bid_size: bid_volume,
                            ask_size: ask_volume,
                            timestamp: SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap()
                                .as_millis() as u64,
                        };
                        
                        let ws_msg = WebSocketMessage::Depth(depth_update);
                        if let Ok(json) = serde_json::to_string(&ws_msg) {
                            if sender.send(Message::Text(json)).await.is_err() {
                                warn!(" Failed to send depth update for {}", symbol);
                                break;
                            }
                        }
                        
                        last_best_bid = best_bid;
                        last_best_ask = best_ask;
                    }
                }
            }
            
            // Test connection alive
            _ = ping_interval.tick() => {
                let ping = WebSocketMessage::Ping {
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64
                };
                if let Ok(ping_json) = serde_json::to_string(&ping) {
                    if sender.send(Message::Text(ping_json)).await.is_err() {
                        break; // Connection broken
                    }
                }
            }
        }
    }

    info!(" Depth stream handler ended for {}", symbol);
}

/// Handles a persistent order-submission WebSocket for one symbol. Clients
/// send `batch` frames carrying a sequence number; the server replies with a
/// `result` frame per batch echoing the same `seq`. Trades produced by the
/// matched orders are broadcast on the trade stream as usual.
///
/// This is the ONLY binary (MessagePack) WebSocket on the service. The trade,
/// depth, and latency streams stay JSON; do not assume binary on those.
pub async fn handle_order_stream(socket: WebSocket, symbol: String, state: AppState) {
    info!("New order stream connection for {}", symbol);

    let (mut sender, mut receiver) = socket.split();
    let mut ping_interval = interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Binary(bytes))) => {
                        let parsed = rmp_serde::from_slice::<OrderStreamMessage>(&bytes);
                        match parsed {
                            Ok(OrderStreamMessage::Batch(req)) => {
                                let response = process_batch(&symbol, &state, req).await;
                                let envelope = match response {
                                    Ok(resp) => OrderStreamMessage::Result(resp),
                                    Err((seq, message)) => OrderStreamMessage::Error {
                                        seq: Some(seq),
                                        message,
                                    },
                                };
                                if let Ok(buf) = rmp_serde::to_vec_named(&envelope) {
                                    if sender.send(Message::Binary(buf)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                            Ok(OrderStreamMessage::Ping { timestamp }) => {
                                let pong = OrderStreamMessage::Pong { timestamp };
                                if let Ok(buf) = rmp_serde::to_vec_named(&pong) {
                                    let _ = sender.send(Message::Binary(buf)).await;
                                }
                            }
                            Ok(_) => {}
                            Err(e) => {
                                let envelope = OrderStreamMessage::Error {
                                    seq: None,
                                    message: format!("invalid frame: {}", e),
                                };
                                if let Ok(buf) = rmp_serde::to_vec_named(&envelope) {
                                    let _ = sender.send(Message::Binary(buf)).await;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Text(_))) => {} // wire is binary now; drop text
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        info!("Order stream connection closed for {}", symbol);
                        break;
                    }
                    Some(Err(e)) => {
                        error!("WebSocket error in order stream: {}", e);
                        break;
                    }
                    None => break,
                }
            }

            _ = ping_interval.tick() => {
                let ping = OrderStreamMessage::Ping {
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64,
                };
                if let Ok(buf) = rmp_serde::to_vec_named(&ping) {
                    if sender.send(Message::Binary(buf)).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    info!("Order stream handler ended for {}", symbol);
}

async fn process_batch(
    symbol: &str,
    state: &AppState,
    req: OrderStreamRequest,
) -> Result<OrderStreamResponse, (u64, String)> {
    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();

    let mut order_ids = Vec::with_capacity(req.orders.len());
    let mut orders = Vec::with_capacity(req.orders.len());
    for o in req.orders {
        let order_id = OrderId(uuid::Uuid::new_v4().as_u128());
        order_ids.push(order_id.0);
        orders.push(if o.kind == OrderKind::Market {
            Order::market(order_id, symbol, o.side, o.quantity, now_ns)
        } else {
            Order {
                id: order_id,
                symbol: symbol.to_string(),
                side: o.side,
                px_ticks: o.price,
                qty: o.quantity,
                ts_ns: now_ns,
                kind: o.kind,
                tif: o.tif,
            }
        });
    }

    let batch_t0 = Instant::now();
    let per_order = state
        .exchange
        .submit_order_batch(symbol, orders)
        .await
        .ok_or((req.seq, "symbol not found".to_string()))?;
    let engine_ns = batch_t0.elapsed().as_nanos() as u64;

    let mut results = Vec::with_capacity(per_order.len());
    for (idx, (trades, latency_ns)) in per_order.into_iter().enumerate() {
        let trade_count = trades.len();
        let filled = trade_count > 0;

        for trade in trades {
            let _ = state.trade_broadcaster.send(TradeEvent {
                symbol: symbol.to_string(),
                trade,
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            });
        }

        results.push(BatchOrderResult {
            order_id: order_ids[idx],
            filled,
            trade_count,
            latency_ns: latency_ns as u64,
        });
    }

    Ok(OrderStreamResponse {
        seq: req.seq,
        results,
        engine_ns,
    })
}

/// Streams per-order latency samples produced by the server-side bot driver.
/// Mirrors `handle_trade_stream`: split socket, `tokio::select!` over input +
/// broadcast + 30s ping.
pub async fn handle_latency_stream(socket: WebSocket, state: AppState) {
    info!("New latency stream connection");

    let (mut sender, mut receiver) = socket.split();
    let mut latency_rx = state.latency_broadcaster.subscribe();
    let mut ping_interval = interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            msg = receiver.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WebSocketMessage>(&text) {
                            if let WebSocketMessage::Ping { timestamp } = ws_msg {
                                let pong = WebSocketMessage::Pong { timestamp };
                                if let Ok(pong_json) = serde_json::to_string(&pong) {
                                    let _ = sender.send(Message::Text(pong_json)).await;
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Binary(_))) => {}
                    Some(Ok(Message::Ping(data))) => {
                        let _ = sender.send(Message::Pong(data)).await;
                    }
                    Some(Ok(Message::Pong(_))) => {}
                    Some(Ok(Message::Close(_))) => {
                        info!("Latency stream connection closed");
                        break;
                    }
                    Some(Err(e)) => {
                        error!("WebSocket error in latency stream: {}", e);
                        break;
                    }
                    None => break,
                }
            }

            sample = latency_rx.recv() => {
                match sample {
                    Ok(sample) => {
                        let ws_msg = WebSocketMessage::Latency(sample);
                        if let Ok(json) = serde_json::to_string(&ws_msg) {
                            if sender.send(Message::Text(json)).await.is_err() {
                                warn!("Failed to send latency sample");
                                break;
                            }
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }

            _ = ping_interval.tick() => {
                let ping = WebSocketMessage::Ping {
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis() as u64
                };
                if let Ok(ping_json) = serde_json::to_string(&ping) {
                    if sender.send(Message::Text(ping_json)).await.is_err() {
                        break;
                    }
                }
            }
        }
    }

    info!("Latency stream handler ended");
}
