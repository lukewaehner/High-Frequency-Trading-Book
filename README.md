# HFTX

A price-time-priority matching engine in Rust, with a real-time exchange service, a CLI client, and a Next.js front end that drives the engine live in the browser.

```
┌──────────────────────────────────────────────────────────────────┐
│  hftx/web        Next.js + React + Zustand + Framer Motion       │
│                  Live order book, depth ladder, latency lab UI   │
├──────────────────────────────────────────────────────────────────┤
│  hftx/cli        clap-driven HTTP client (submit / cancel /      │
│                  depth / status / health)                        │
├──────────────────────────────────────────────────────────────────┤
│  exchange-service  Axum HTTP + WebSocket; multi-symbol Exchange  │
│                    coordinator; broadcast channels for trades    │
├──────────────────────────────────────────────────────────────────┤
│  orderbook       Lock-light core: BTreeMap price levels, FIFO    │
│                  per-level queues, lazy cancel, partial fills    │
└──────────────────────────────────────────────────────────────────┘
```

## Performance

Numbers from the `cargo run --release` lab on an M-series Mac. See [`hftx/src/latency_test.rs`](hftx/src/latency_test.rs) for the harness.

| Path                     | Latency / throughput           |
| ------------------------ | ------------------------------ |
| Best bid / ask lookup    | 3 to 6 ns                      |
| Order submission         | ~113 ns                        |
| Cross-spread match       | ~1.47 µs end-to-end            |
| Sustained throughput     | 200k to 500k orders / sec      |
| WebSocket fan-out        | < 100 µs                       |

## Prerequisites

- Rust 1.82+ (workspace edition 2021)
- Node 20+ and `pnpm` (the web app uses pnpm)
- GNU `make` (any recent macOS / Linux box)

## Quick start

Everything is wired through the workspace `Makefile` at `hftx/`.

```bash
cd hftx
make dev
```

That spawns:

- the exchange service on `http://localhost:8080` (REST + WS)
- the Next.js web app on `http://localhost:3000`

Ctrl-C tears both down. Browse `localhost:3000` and the front end connects to the engine over the env-default `NEXT_PUBLIC_HFTX_URL=http://localhost:8080`.

`make help` lists the rest:

```
help        Show this help
dev         Run engine (8080) + web (3000) together; Ctrl-C tears down both
engine      Run the exchange service alone (port 8080)
web         Run the Next.js web frontend alone (port 3000)
cli         Run the CLI client; pass args via ARGS, e.g. make cli ARGS="health"
bench       Run Criterion benchmarks (orderbook crate)
perf        Run the latency / throughput lab in release mode
test        Run all workspace tests
fmt         cargo fmt --all
clippy      cargo clippy --workspace --all-targets -D warnings
clean       Clean Rust target/ directory
clean-all   Also clean web build cache and node_modules
```

## Repository layout

```
HFT-Ledger/
├── README.md                       (this file)
└── hftx/
    ├── Cargo.toml                  workspace manifest
    ├── Makefile                    workspace runner
    ├── scripts/dev.sh              parallel engine + web runner
    │
    ├── orderbook/                  core matching engine (library crate)
    │   ├── src/
    │   │   ├── lib.rs                OrderBook implementation
    │   │   ├── price_levels.rs       per-side BTreeMap + FIFO queues
    │   │   ├── stdio_rendering.rs    pretty-print for tests / lab
    │   │   └── types.rs              Order, Trade, OrderId, Side
    │   └── benches/orderbook_bench.rs  Criterion suite
    │
    ├── exchange-service/           Axum REST + WS server
    │   ├── src/
    │   │   ├── main.rs               routes, app state, error mapping
    │   │   ├── exchange.rs           multi-symbol Exchange coordinator
    │   │   ├── websocket.rs          trade + depth stream handlers
    │   │   └── types.rs              wire types
    │   └── Cargo.toml
    │
    ├── cli/                        clap-based HTTP client
    │   └── src/main.rs               Submit / Cancel / Depth / Status / Symbols / Health
    │
    ├── src/                        latency / throughput lab (root crate)
    │   ├── main.rs                   demo runner
    │   └── latency_test.rs           micro-benchmarks
    │
    └── web/                        Next.js + React + Tailwind v4 front end
        ├── app/                      App-Router entry
        ├── components/               Hero, Ladder, OrderEntry, Engine, Sim, TopBar
        └── lib/                      exchange client, Zustand stores, formatters
```

## Components

### `orderbook` (core)

A lock-light price-time-priority matching engine.

- BTreeMap on each side for O(log n) best-price access.
- VecDeque per price level for FIFO match order at the level.
- Lazy cancel: cancelled orders linger on the queue and are skipped at match time, avoiding mid-queue removal cost.
- Partial fills cascade through the queue until the taker is exhausted or the level is empty.

```rust
use orderbook::{Order, OrderBook, OrderId, Side};

let mut book = OrderBook::new();
book.submit_limit(Order { id: OrderId(1), symbol: "AAPL".into(),
    side: Side::Ask, px_ticks: 15_000, qty: 100, ts_ns: 0 });
let trades = book.submit_limit(Order { id: OrderId(2), symbol: "AAPL".into(),
    side: Side::Bid, px_ticks: 15_000, qty: 60, ts_ns: 1 });
assert_eq!(trades.len(), 1);
```

### `exchange-service` (HTTP + WS)

Axum 0.7 server. Multi-symbol `Exchange` holding one `OrderBook` per symbol behind `RwLock`. Trade events are fanned out via a `broadcast::Sender<TradeEvent>`; depth snapshots are polled by the WS depth handler.

| Method | Path                                  | Notes                                         |
| ------ | ------------------------------------- | --------------------------------------------- |
| GET    | `/health`                             | Liveness + version                            |
| GET    | `/symbols`                            | Active symbols                                |
| GET    | `/symbols/:symbol/orderbook`          | Best bid / ask + level counts                 |
| GET    | `/symbols/:symbol/depth?levels=10`    | N-level market depth                          |
| POST   | `/symbols/:symbol/orders`             | Submit a single order, returns trades         |
| POST   | `/symbols/:symbol/orders/batch`       | Submit a batch, returns per-order latency_ns  |
| DELETE | `/symbols/:symbol/orders/:order_id`   | Cancel an order                               |
| WS     | `/symbols/:symbol/trades/stream`      | Live trade events                             |
| WS     | `/symbols/:symbol/depth/stream`       | Live depth snapshots                          |

Submit body:

```json
{ "side": "Bid", "price": 15000, "quantity": 100 }
```

WS trade event:

```json
{ "type": "trade",
  "trade": { "maker": 12, "taker": 13, "symbol": "AAPL",
             "px_ticks": 15000, "qty": 60, "ts_ns": 1700000000000 },
  "timestamp": 1700000000000 }
```

### `cli` (HTTP client)

```bash
# from hftx/
make cli ARGS="health"
make cli ARGS="symbols"
make cli ARGS="depth --symbol AAPL --levels 5"
make cli ARGS="submit --symbol AAPL --side bid --price 15000 --quantity 100"
make cli ARGS="status --symbol AAPL"
make cli ARGS="cancel --symbol AAPL --order-id 12345"
```

The CLI defaults to `http://localhost:8080`. Override with `--server` (e.g. `make cli ARGS="--server http://example:8080 health"`).

### `web` (front end)

Next.js 16 + React 19 + Tailwind v4 + Zustand + Framer Motion. The page IS the product: visitors land on a live read-out of the running engine and can drive it via the in-page sim.

- `app/page.tsx` composes the sections: `TopBar`, `Hero`, `Ladder`, `Sim`, `Engine`.
- `lib/store.ts` holds two Zustand stores: `useMarketStore` (book, trades, connected) and `useLatencyStore` (samples, throughputOps).
- `lib/exchange.ts` wraps the REST + WS endpoints. `NEXT_PUBLIC_HFTX_URL` overrides the default `http://localhost:8080`.
- See [`hftx/web/README.md`](hftx/web/README.md) for the front-end-specific notes.

### `src/` (latency lab)

The workspace root crate (`hftx`) is the latency / throughput harness. It pegs an in-process `OrderBook`, runs scripted scenarios, and prints percentiles.

```bash
make perf
```

## Testing

```bash
make test                 # cargo test --workspace
cargo test -p orderbook   # core matching engine unit tests
```

## Benchmarks

```bash
make bench
# orderbook/target/criterion/report/index.html for the HTML report
```

## Configuration

- `NEXT_PUBLIC_HFTX_URL` (web) — base URL for REST + WS. Default `http://localhost:8080`.
- `RUST_LOG` (engine) — tracing filter. Try `RUST_LOG=info make engine` for the verbose path.

## License

MIT. See `LICENSE`.
