# HFT Ledger - High-Frequency Trading Order Book

A complete high-frequency trading (HFT) system implemented in Rust, featuring a price-time priority matching engine, real-time market data streaming, and comprehensive performance testing. Designed for microsecond-level latency and sustained throughput exceeding 100,000 orders per second.

## Table of Contents

- [Architecture](#-architecture)
- [Features](#-features)
- [Performance](#-performance)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Components](#-components)
- [Benchmarks](#-benchmarks)
- [API Documentation](#-api-documentation)
- [Testing](#-testing)
- [Development](#-development)
- [Examples](#-examples)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)

## Architecture

The system is built with a modular architecture optimized for high-frequency trading:

```
┌─────────────────────────────────────────────────────────────┐
│                    HFT Ledger System                        │
├─────────────────────────────────────────────────────────────┤
│  CLI Client          │  WebSocket Client  │  REST Client    │
│  (Command Line)      │  (Real-time UI)    │  (HTTP API)     │
├─────────────────────────────────────────────────────────────┤
│                 Exchange Service (Axum)                     │
│  ┌─────────────────┬─────────────────┬─────────────────┐   │
│  │   REST API      │   WebSocket     │   Trade Engine  │   │
│  │   Endpoints     │   Streaming     │   Coordinator   │   │
│  └─────────────────┴─────────────────┴─────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│                   Core Order Book Engine                    │
│  ┌─────────────────┬─────────────────┬─────────────────┐   │
│  │  Price Levels   │  Order Matching │  Trade Records  │   │
│  │  (BTreeMap)     │  (Price-Time)   │  (Generation)   │   │
│  └─────────────────┴─────────────────┴─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Core Principles

- **Zero-Copy Operations**: Minimal memory allocations during order processing
- **Lock-Free Design**: Using concurrent data structures where possible
- **Price-Time Priority**: Industry-standard matching algorithm
- **Microsecond Latency**: Optimized for ultra-low latency trading
- **High Throughput**: Sustained performance under heavy load

## Features

### Order Book Engine

- **Price-Time Priority Matching**: Orders matched by best price first, then by time (FIFO)
- **Partial Fills**: Large orders can execute against multiple counterparties
- **Efficient Data Structures**: BTreeMap for O(log n) price operations, VecDeque for FIFO queues
- **Lazy Cancellation**: Orders marked as cancelled but removed during matching for performance
- **Trade Generation**: Automatic trade record creation with maker/taker identification

### Exchange Service

- **Async REST API**: Built with Axum for high-performance HTTP handling
- **Real-time WebSocket Streams**: Live trade execution and market depth updates
- **Multi-Symbol Support**: Concurrent order books for multiple trading instruments
- **Thread-Safe Operations**: DashMap + RwLock for concurrent access
- **CORS Support**: Ready for web-based trading interfaces

### Client Interfaces

- **Command Line Interface**: Full-featured CLI for order management
- **WebSocket Client**: Real-time market data visualization
- **REST API**: Standard HTTP interface for integration

### Performance Testing

- **Comprehensive Benchmarks**: Latency and throughput measurements
- **Real-time Profiling**: Nanosecond-precision timing
- **Stress Testing**: Sustained load testing with mixed workloads
- **Statistical Analysis**: Multiple iterations for reliable metrics

## Performance

Based on benchmarks on modern hardware:

| Metric                   | Performance          | Target            |
| ------------------------ | -------------------- | ----------------- |
| **Market Data Access**   | 3-6 ns per call      | < 10 ns           |
| **Order Submission**     | ~113 ns per order    | < 500 ns          |
| **Order Matching**       | ~1.47 μs end-to-end  | < 5 μs            |
| **Sustained Throughput** | 200k-500k orders/sec | > 100k orders/sec |
| **WebSocket Latency**    | < 100 μs             | < 1 ms            |
| **Memory Usage**         | Minimal allocations  | Zero-copy design  |

### Performance Characteristics

- **Latency Distribution**: 99th percentile < 2 μs for order processing
- **Jitter**: < 10% variance under normal load
- **Scalability**: Linear performance scaling with CPU cores
- **Memory Efficiency**: Constant memory usage per price level

## Quick Start

### Prerequisites

- Rust 1.82+ (for proc macro support)
- Cargo (included with Rust)

### Installation

```bash
# Clone the repository
git clone https://github.com/lukewaehner/hft-ledger.git
cd hft-ledger/hftx

# Build the project
cargo build --release
```

### Running the Performance Lab

```bash
# Run comprehensive performance tests and demo
cargo run --release

# Expected output:
#  HFT Ledger - Real-time Latency Tests
#  Market Data Latency Test
#   Best bid lookup: 3.45 ns/call
#   Best ask lookup: 3.52 ns/call
# ...
```

### Starting the Exchange Service

```bash
# Start the exchange service
cd exchange-service
RUST_LOG=info cargo run --release

# Service starts on http://localhost:8080
# WebSocket streams available at ws://localhost:8080/symbols/{symbol}/trades/stream
```

### Using the CLI Client

```bash
# Navigate to CLI directory
cd cli

# Submit a buy order
cargo run -- submit --symbol AAPL --side bid --price 15000 --quantity 100

# Check market status
cargo run -- status --symbol AAPL

# View market depth
cargo run -- depth --symbol AAPL --levels 5

# Cancel an order
cargo run -- cancel --symbol AAPL --order-id 123456789
```

### WebSocket Client

Open `websocket_client.html` in a web browser to see real-time market data streaming and submit test orders.

## Project Structure

```
hftx/
├── orderbook/              # Core order book library
│   ├── src/
│   │   ├── lib.rs            # Main order book implementation
│   │   ├── types.rs          # Core data structures (Order, Trade, etc.)
│   │   └── price_levels.rs   # Price level management
│   ├── benches/              # Criterion benchmarks
│   └── Cargo.toml
│
├── exchange-service/       # HTTP/WebSocket exchange service
│   ├── src/
│   │   ├── main.rs           # REST API server and routing
│   │   ├── exchange.rs       # Multi-symbol exchange engine
│   │   ├── websocket.rs      # Real-time streaming handlers
│   │   └── types.rs          # API request/response types
│   └── Cargo.toml
│
├── cli/                   # Command-line interface
│   ├── src/
│   │   └── main.rs           # CLI commands and HTTP client
│   └── Cargo.toml
│
├── src/                   # Performance testing and demo
│   ├── main.rs               # Main demo application
│   └── latency_test.rs       # Comprehensive performance tests
│
├── websocket_client.html   # Web-based real-time client
├── test_exchange.sh       # Exchange service test script
├── performance_analysis.md # Benchmark results and analysis
├── EXCHANGE_SERVICE.md     # Exchange service documentation
└── Cargo.toml             # Workspace configuration
```

## Components

### Core Order Book (`orderbook/`)

The heart of the system - a high-performance order matching engine.

**Key Files:**

- `lib.rs`: Main OrderBook implementation with price-time priority matching
- `types.rs`: Core data structures (Order, Trade, OrderId, Side)
- `price_levels.rs`: Efficient price level management with FIFO queues

**Features:**

- Price-time priority matching
- Partial fill support
- Lazy cancellation for performance
- Zero-copy operations where possible

### Exchange Service (`exchange-service/`)

A complete trading service with REST API and WebSocket streaming.

**Key Files:**

- `main.rs`: Axum-based HTTP server with routing
- `exchange.rs`: Multi-symbol exchange coordination
- `websocket.rs`: Real-time trade and depth streaming
- `types.rs`: API data structures

**Endpoints:**

- `GET /health` - Service health check
- `GET /symbols` - List available symbols
- `POST /symbols/{symbol}/orders` - Submit orders
- `DELETE /symbols/{symbol}/orders/{id}` - Cancel orders
- `GET /symbols/{symbol}/depth` - Market depth
- `WS /symbols/{symbol}/trades/stream` - Live trades
- `WS /symbols/{symbol}/depth/stream` - Live depth updates

### CLI Client (`cli/`)

Full-featured command-line interface for trading operations.

**Commands:**

- `submit` - Place limit orders
- `status` - Check order book state
- `depth` - View market depth
- `cancel` - Cancel existing orders
- `health` - Check service health
- `symbols` - List available symbols

### Performance Testing (`src/`)

Comprehensive performance measurement and demonstration.

**Tests:**

- Market data access latency
- Order submission performance
- Order matching latency
- Cancellation strategy comparison
- Sustained throughput testing

## Benchmarks

### Running Benchmarks

```bash
# Run Criterion benchmarks
cd orderbook
cargo bench

# Run custom latency tests
cd ..
cargo run --release
```

### Benchmark Categories

1. **Order Submission**: Non-crossing order processing
2. **Order Matching**: Cross-spread execution latency
3. **Market Data**: Best bid/ask lookup performance
4. **Price Levels**: Price level operations
5. **Cancellation**: Lazy vs eager removal comparison
6. **High Frequency**: Realistic HFT scenarios

### Results Analysis

See `performance_analysis.md` for detailed benchmark results and analysis.

## API Documentation

### REST API

#### Submit Order

```http
POST /symbols/{symbol}/orders
Content-Type: application/json

{
  "side": "Bid",
  "price": 15000,
  "quantity": 100
}
```

#### Get Market Depth

```http
GET /symbols/{symbol}/depth?levels=5
```

#### Cancel Order

```http
DELETE /symbols/{symbol}/orders/{order_id}
```

### WebSocket API

#### Trade Stream

```javascript
const ws = new WebSocket("ws://localhost:8080/symbols/AAPL/trades/stream");

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "trade") {
    console.log(`Trade: ${data.trade.qty} @ ${data.trade.px_ticks}`);
  }
};
```

#### Depth Stream

```javascript
const depthWs = new WebSocket("ws://localhost:8080/symbols/AAPL/depth/stream");

depthWs.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === "depth") {
    console.log(`Bid: ${data.best_bid}, Ask: ${data.best_ask}`);
  }
};
```

## Testing

### Unit Tests

```bash
# Run all tests
cargo test --workspace

# Run specific component tests
cargo test --package orderbook
cargo test --package exchange-service
```

### Integration Tests

```bash
# Test the exchange service
./test_exchange.sh

# Test CLI functionality
cd cli
cargo run -- health
```

### Performance Tests

```bash
# Run comprehensive performance suite
cargo run --release

# Run specific benchmarks
cd orderbook
cargo bench
```

## Development

### Building

```bash
# Debug build
cargo build

# Release build (optimized)
cargo build --release

# Build specific component
cargo build --package orderbook
```

### Code Quality

```bash
# Format code
cargo fmt

# Run linter
cargo clippy

# Check for common issues
cargo audit
```

### Documentation

```bash
# Generate documentation
cargo doc --open

# Generate documentation for all dependencies
cargo doc --document-private-items --open
```

## Examples

### Basic Order Book Usage

```rust
use orderbook::{OrderBook, Order, OrderId, Side};

let mut book = OrderBook::new();

// Submit a sell order
let ask = Order {
    id: OrderId(1),
    symbol: "AAPL".to_string(),
    side: Side::Ask,
    px_ticks: 15000,  // $150.00
    qty: 100,
    ts_ns: 1_000_000_000,
};

book.submit_limit(ask);

// Submit a crossing buy order
let bid = Order {
    id: OrderId(2),
    symbol: "AAPL".to_string(),
    side: Side::Bid,
    px_ticks: 15000,  // Will match immediately
    qty: 50,
    ts_ns: 1_000_000_001,
};

let trades = book.submit_limit(bid);
println!("Trades executed: {}", trades.len());
```

### WebSocket Client Integration

```javascript
// Connect to trade stream
const tradeWs = new WebSocket("ws://localhost:8080/symbols/AAPL/trades/stream");

tradeWs.onopen = () => {
  console.log("Connected to trade stream");
};

tradeWs.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "trade":
      updateTradeLog(data.trade);
      break;
    case "ping":
      // Respond to ping
      tradeWs.send(
        JSON.stringify({
          type: "pong",
          timestamp: data.timestamp,
        })
      );
      break;
  }
};
```

### CLI Automation

```bash
#!/bin/bash
# Automated trading script

# Check service health
cargo run -- health

# Submit multiple orders
for i in {1..10}; do
    price=$((15000 + i))
    cargo run -- submit --symbol AAPL --side ask --price $price --quantity 100
done

# Check final state
cargo run -- status --symbol AAPL
```

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
