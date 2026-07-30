# HFTX

A price-time-priority matching engine written in Rust, wrapped in a small exchange service, a CLI, and a Next.js front end that drives the engine live in the browser. It started as a "how fast can a toy order book go" experiment and grew a UI so the latency numbers are something you can watch instead of read.

```
┌──────────────────────────────────────────────────────────────────┐
│  web             Next.js + React + Zustand + Framer Motion       │
│                  Live order book, depth ladder, latency lab UI   │
├──────────────────────────────────────────────────────────────────┤
│  cli             clap-driven HTTP client (submit / cancel /      │
│                  depth / status / health)                        │
├──────────────────────────────────────────────────────────────────┤
│  exchange-service  Axum HTTP + WebSocket; multi-symbol Exchange  │
│                    coordinator; broadcast channels for trades    │
├──────────────────────────────────────────────────────────────────┤
│  orderbook       Core matching: BTreeMap price levels, FIFO      │
│                  per-level queues, lazy cancel, partial fills    │
└──────────────────────────────────────────────────────────────────┘
```

## Performance

These come from the latency lab (`cargo run --release`, or `make perf`) on an M-series Mac. They'll vary with your hardware, but the shape holds. The harness lives in [`src/latency_test.rs`](src/latency_test.rs).

| Path                  | Latency / throughput      |
| --------------------- | ------------------------- |
| Best bid / ask lookup | 3–6 ns                    |
| Order submission      | ~113 ns                   |
| Cross-spread match    | ~1.47 µs end-to-end       |
| Sustained throughput  | 200k–500k orders / sec    |
| WebSocket fan-out     | < 100 µs                  |

## Prerequisites

- Rust 1.82+ (workspace is edition 2021)
- Node 20+ and `pnpm` for the web app
- GNU `make` — anything recent on macOS or Linux is fine

## Quick start

Everything runs through the workspace `Makefile` at the repo root:

```bash
make dev
```

That brings up two processes:

- the exchange service on `http://localhost:8080` (REST + WebSocket)
- the Next.js web app on `http://localhost:3000`

Open `localhost:3000` and the front end connects to the engine at the default `NEXT_PUBLIC_HFTX_URL=http://localhost:8080`. Ctrl-C stops both.

The rest of the targets, from `make help`:

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
hftx/
├── README.md                       (this file)
├── Cargo.toml                      workspace manifest
├── Makefile                        workspace runner
├── scripts/dev.sh                  parallel engine + web runner
│
├── orderbook/                      core matching engine (library crate)
│   ├── src/
│   │   ├── lib.rs                    OrderBook implementation
│   │   ├── price_levels.rs           per-side BTreeMap + FIFO queues
│   │   ├── stdio_rendering.rs        pretty-print for tests / lab
│   │   └── types.rs                  Order, Trade, OrderId, Side
│   └── benches/orderbook_bench.rs      Criterion suite
│
├── exchange-service/               Axum REST + WS server
│   ├── src/
│   │   ├── main.rs                   routes, app state, error mapping
│   │   ├── exchange.rs               multi-symbol Exchange coordinator
│   │   ├── websocket.rs              trade + depth + order stream handlers
│   │   └── types.rs                  wire types
│   └── Cargo.toml
│
├── cli/                            clap-based HTTP client
│   └── src/main.rs                   Submit / Cancel / Depth / Status / Symbols / Health
│
├── src/                            latency / throughput lab (root crate)
│   ├── main.rs                       demo runner
│   └── latency_test.rs               micro-benchmarks
│
└── web/                            Next.js + React + Tailwind v4 front end
    ├── app/                          App-Router entry
    ├── components/                   Hero, Ladder, OrderEntry, Engine, Sim, TopBar
    └── lib/                          exchange client, Zustand stores, formatters
```

## Components

### `orderbook` (core)

The matching engine. Prices are integer ticks and time priority is nanosecond timestamps, so there's no floating point anywhere in the hot path.

- A `BTreeMap` on each side gives O(log n) access to the best price.
- Each price level is a `VecDeque`, so fills at a level come out in FIFO order.
- Cancels are lazy: a cancelled order stays on the queue and gets skipped when it reaches the front, which keeps us out of the mid-queue removal cost.
- Partial fills walk the queue until the taker is exhausted or the level empties.

```rust
use orderbook::{Order, OrderBook, OrderId, Side};

let mut book = OrderBook::new();
book.submit_limit(Order::limit(OrderId(1), "AAPL", Side::Ask, 15_000, 100, 0));
let trades = book.submit_limit(Order::limit(OrderId(2), "AAPL", Side::Bid, 15_000, 60, 1));
assert_eq!(trades.len(), 1);
```

### `exchange-service` (HTTP + WS)

An Axum 0.7 server around the engine. State is a `DashMap<String, RwLock<OrderBook>>` — one lock-guarded book per symbol, so unrelated symbols never contend. It boots with a handful of seeded symbols (AAPL, TSLA, MSFT, NVDA, GOOGL). Trades fan out over a `broadcast` channel; the depth stream polls snapshots on an interval.

| Method | Path                                | Notes                                          |
| ------ | ----------------------------------- | ---------------------------------------------- |
| GET    | `/health`                           | Liveness + version                             |
| GET    | `/symbols`                          | Active symbols                                 |
| GET    | `/symbols/:symbol/orderbook`        | Best bid / ask + level counts                  |
| GET    | `/symbols/:symbol/depth?levels=10`  | N-level market depth                           |
| POST   | `/symbols/:symbol/orders`           | Submit a single order, returns trades          |
| POST   | `/symbols/:symbol/orders/batch`     | Submit a batch, returns per-order `latency_ns` |
| DELETE | `/symbols/:symbol/orders/:order_id` | Cancel an order                                |
| WS     | `/symbols/:symbol/trades/stream`    | Live trade events (JSON)                       |
| WS     | `/symbols/:symbol/depth/stream`     | Live depth snapshots (JSON)                    |
| WS     | `/symbols/:symbol/orders/stream`    | Order submission over MessagePack frames       |

The order-submission WebSocket is the one binary channel: frames are MessagePack (`rmp-serde`) rather than JSON, which is why it lives apart from the JSON trade and depth streams. There's also a small `/sim/*` group (`start`, `stop`, `status`, and a `latency/stream` WS) that the front end uses to run and observe the in-browser order generator.

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
# from repo root
make cli ARGS="health"
make cli ARGS="symbols"
make cli ARGS="depth --symbol AAPL --levels 5"
make cli ARGS="submit --symbol AAPL --side bid --price 15000 --quantity 100"
make cli ARGS="status --symbol AAPL"
make cli ARGS="cancel --symbol AAPL --order-id 12345"
```

It talks to `http://localhost:8080` by default. Point it elsewhere with `--server`, e.g. `make cli ARGS="--server http://example:8080 health"`.

### `web` (front end)

Next.js 16, React 19, Tailwind v4, Zustand, Framer Motion. There's no separate dashboard — the landing page is the app. You load it onto a live read-out of the running engine and drive it with the in-page sim.

- `app/page.tsx` stitches the sections together: `TopBar`, `Hero`, `Ladder`, `Sim`, `Engine`.
- `lib/store.ts` has two Zustand stores — `useMarketStore` (book, trades, connected) and `useLatencyStore` (samples, throughputOps).
- `lib/exchange.ts` wraps the REST + WS endpoints; set `NEXT_PUBLIC_HFTX_URL` to override the `http://localhost:8080` default.

Front-end-specific notes are in [`web/README.md`](web/README.md).

### `src/` (latency lab)

The workspace root crate (`hftx`) is the benchmark harness. It runs an in-process `OrderBook` through scripted scenarios and prints percentiles — no server, no network, just the engine.

```bash
make perf
```

## Testing

```bash
make test                 # cargo test --workspace
cargo test -p orderbook   # just the matching-engine unit tests
```

## Benchmarks

```bash
make bench
# HTML report: orderbook/target/criterion/report/index.html
```

## Configuration

- `NEXT_PUBLIC_HFTX_URL` (web) — base URL for REST + WS. Defaults to `http://localhost:8080`.
- `RUST_LOG` (engine) — tracing filter. `RUST_LOG=info make engine` gets you the chatty startup log.

## License

MIT.
</content>
</invoke>
