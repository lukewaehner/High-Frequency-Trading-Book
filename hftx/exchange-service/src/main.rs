use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use orderbook::{OrderBook, Order, OrderId, Side, Trade};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::{broadcast, RwLock};
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

mod exchange;
mod websocket;
mod types;

use exchange::Exchange;
use types::*;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let exchange = Arc::new(Exchange::new());
    let (trade_tx, _) = broadcast::channel(1000);

    let app = Router::new()
        .route("/", get(serve_frontend))
        .route("/health", get(health_check))
        .route("/symbols", get(list_symbols))
        .route("/symbols/:symbol/orderbook", get(get_orderbook))
        .route("/symbols/:symbol/depth", get(get_depth))
        .route("/symbols/:symbol/orders", post(submit_order))
        .route("/symbols/:symbol/orders/:order_id", delete(cancel_order))
        .route("/symbols/:symbol/trades/stream", get(trade_stream))
        .route("/symbols/:symbol/depth/stream", get(depth_stream))
        .layer(CorsLayer::permissive())
        .with_state(AppState {
            exchange: exchange.clone(),
            trade_broadcaster: trade_tx,
        });

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8080")
        .await
        .unwrap();

    info!(" HFT Exchange Service starting on http://0.0.0.0:8080");
    info!(" Web Interface: http://localhost:8080");
    info!(" Available endpoints:");
    info!("  GET  / - Web trading interface");
    info!("  GET  /health - Health check");
    info!("  GET  /symbols - List available symbols");
    info!("  GET  /symbols/:symbol/orderbook - Get order book state");
    info!("  GET  /symbols/:symbol/depth - Get market depth");
    info!("  POST /symbols/:symbol/orders - Submit order");
    info!("  DEL  /symbols/:symbol/orders/:id - Cancel order");
    info!("  WS   /symbols/:symbol/trades/stream - Trade stream");
    info!("  WS   /symbols/:symbol/depth/stream - Depth stream");

    axum::serve(listener, app).await.unwrap();
}

#[derive(Clone)]
struct AppState {
    exchange: Arc<Exchange>,
    trade_broadcaster: broadcast::Sender<TradeEvent>,
}

async fn serve_frontend() -> impl IntoResponse {
    Html(include_str!("../static/index.html"))
}

async fn health_check() -> impl IntoResponse {
    Json(serde_json::json!({
        "status": "healthy",
        "service": "hft-exchange",
        "version": "0.1.0",
        "timestamp": SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()
    }))
}

async fn list_symbols(State(state): State<AppState>) -> impl IntoResponse {
    let symbols = state.exchange.list_symbols().await;
    Json(SymbolsResponse { symbols })
}

async fn get_orderbook(
    Path(symbol): Path<String>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let orderbook_state = state.exchange.get_orderbook_state(&symbol).await
        .ok_or(AppError::SymbolNotFound)?;
    
    Ok(Json(orderbook_state))
}

async fn get_depth(
    Path(symbol): Path<String>,
    Query(params): Query<DepthQuery>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let depth = state.exchange.get_market_depth(&symbol, params.levels.unwrap_or(10)).await
        .ok_or(AppError::SymbolNotFound)?;
    
    Ok(Json(depth))
}

async fn submit_order(
    Path(symbol): Path<String>,
    State(state): State<AppState>,
    Json(request): Json<SubmitOrderRequest>,
) -> Result<impl IntoResponse, AppError> {
    let order_id = OrderId(uuid::Uuid::new_v4().as_u128());
    
    let order = Order {
        id: order_id,
        symbol: symbol.clone(),
        side: request.side,
        px_ticks: request.price,
        qty: request.quantity,
        ts_ns: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
    };

    let trades = state.exchange.submit_order(symbol.clone(), order).await
        .ok_or(AppError::SymbolNotFound)?;

    // Broadcast trades via WebSocket
    for trade in &trades {
        let trade_event = TradeEvent {
            symbol: symbol.clone(),
            trade: trade.clone(),
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis(),
        };
        let _ = state.trade_broadcaster.send(trade_event);
    }

    let response = SubmitOrderResponse {
        order_id: order_id.0,
        status: if trades.is_empty() { "rested".to_string() } else { "filled".to_string() },
        trades,
    };

    Ok((StatusCode::CREATED, Json(response)))
}

async fn cancel_order(
    Path((symbol, order_id)): Path<(String, String)>,
    State(state): State<AppState>,
) -> Result<impl IntoResponse, AppError> {
    let order_id = order_id.parse::<u128>()
        .map_err(|_| AppError::InvalidOrderId)?;
    
    let cancelled = state.exchange.cancel_order(&symbol, OrderId(order_id)).await
        .ok_or(AppError::SymbolNotFound)?;

    if cancelled {
        Ok(Json(serde_json::json!({"status": "cancelled", "order_id": order_id})))
    } else {
        Err(AppError::OrderNotFound)
    }
}

async fn trade_stream(
    Path(symbol): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| websocket::handle_trade_stream(socket, symbol, state))
}

async fn depth_stream(
    Path(symbol): Path<String>,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| websocket::handle_depth_stream(socket, symbol, state))
}

#[derive(Debug)]
enum AppError {
    SymbolNotFound,
    OrderNotFound,
    InvalidOrderId,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::SymbolNotFound => (StatusCode::NOT_FOUND, "Symbol not found"),
            AppError::OrderNotFound => (StatusCode::NOT_FOUND, "Order not found"),
            AppError::InvalidOrderId => (StatusCode::BAD_REQUEST, "Invalid order ID"),
        };

        let body = Json(serde_json::json!({
            "error": message,
            "code": status.as_u16()
        }));

        (status, body).into_response()
    }
} 