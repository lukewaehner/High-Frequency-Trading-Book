// Prices are stored as integer ticks. The Rust engine uses px_ticks where
// 1 tick = $0.01 (so 15000 ticks = $150.00). Keep that contract here.

export const TICKS_PER_DOLLAR = 100;

export function ticksToPrice(ticks: number): number {
  return ticks / TICKS_PER_DOLLAR;
}

export function formatPrice(ticks: number, opts?: { sign?: boolean }): string {
  const dollars = ticksToPrice(ticks);
  const formatted = dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (opts?.sign && ticks > 0) return `+${formatted}`;
  return formatted;
}

export function formatQty(qty: number): string {
  if (qty >= 1_000_000) return `${(qty / 1_000_000).toFixed(2)}M`;
  if (qty >= 10_000) return `${(qty / 1_000).toFixed(1)}k`;
  return qty.toLocaleString("en-US");
}

export function formatNs(ns: number): string {
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

export function formatThroughput(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(1)}k`;
  return ops.toFixed(0);
}

export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 1_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1_000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}
