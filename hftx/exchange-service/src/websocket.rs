//! WebSocket handlers for real-time market data streaming.
//!
//! Provides live trade execution and market depth updates via WebSocket connections.
//! Uses tokio::select! for concurrent handling of messages, broadcasts, and heartbeats.

use axum::extract::ws::{Message, WebSocket};
use futures::{sink::SinkExt, stream::StreamExt};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time::interval;
use tracing::{error, info, warn};

use crate::{types::*, AppState};

/// Handles real-time trade streaming for a symbol.
/// 
/// Streams trade executions immediately as they occur. Includes ping/pong
/// heartbeat for connection health monitoring.
pub async fn handle_trade_stream(socket: WebSocket, symbol: String, state: AppState) {
    info!("🔗 New trade stream connection for {}", symbol);
    
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
                        .as_millis()
                };
                if let Ok(ping_json) = serde_json::to_string(&ping) {
                    if sender.send(Message::Text(ping_json)).await.is_err() {
                        break; // Connection broken
                    }
                }
            }
        }
    }
    
    info!("✅ Trade stream handler ended for {}", symbol);
}

/// Handles real-time market depth streaming for a symbol.
/// 
/// Sends depth updates at 10 Hz (every 100ms) but only when prices change.
/// Includes initial snapshot on connection.
pub async fn handle_depth_stream(socket: WebSocket, symbol: String, state: AppState) {
    info!("📊 New depth stream connection for {}", symbol);
    
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
                .as_millis(),
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
            // Handle incoming messages (same as trade stream)
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
                                .as_millis(),
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
            
            // Send periodic heartbeat pings
            _ = ping_interval.tick() => {
                let ping = WebSocketMessage::Ping {
                    timestamp: SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap()
                        .as_millis()
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