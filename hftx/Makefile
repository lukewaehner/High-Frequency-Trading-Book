.DEFAULT_GOAL := help
.PHONY: help dev engine web cli bench perf test fmt clippy clean clean-all

help: ## Show this help
	@awk 'BEGIN{FS=":.*?## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[1m%-12s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## Run engine (8080) + web (3000) together; Ctrl-C tears down both
	@bash scripts/dev.sh

engine: ## Run the exchange service alone (port 8080)
	cargo run -p exchange-service

web: ## Run the Next.js web frontend alone (port 3000)
	cd web && pnpm dev

cli: ## Run the CLI client; pass args via ARGS, e.g. make cli ARGS="health"
	cargo run -p cli -- $(ARGS)

bench: ## Run Criterion benchmarks (orderbook crate)
	cd orderbook && cargo bench

perf: ## Run the latency / throughput lab in release mode
	cargo run --release

test: ## Run all workspace tests
	cargo test --workspace

fmt: ## cargo fmt --all
	cargo fmt --all

clippy: ## cargo clippy --workspace --all-targets -D warnings
	cargo clippy --workspace --all-targets -- -D warnings

clean: ## Clean Rust target/ directory
	cargo clean

clean-all: clean ## Also clean web build cache and node_modules
	rm -rf web/.next web/node_modules
