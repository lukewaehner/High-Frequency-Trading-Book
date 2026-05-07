"use client";

import { create } from "zustand";
import type { PriceLevel, Trade } from "./types";

// Default symbol the showcase trades on. The engine pre-creates books for
// AAPL, TSLA, MSFT, NVDA, GOOGL on boot.
export const DEFAULT_SYMBOL = "AAPL";

// Mid-price the sim seeds around (in ticks; 1 tick = $0.01).
export const SEED_MID_TICKS = 18_750; // $187.50

// ----- Market data -----------------------------------------------------------

interface MarketState {
  symbol: string;
  connected: boolean;
  bestBid: number | null;
  bestAsk: number | null;
  bidSize: number;
  askSize: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  trades: Trade[]; // newest first, capped
  lastTradeTs: number | null;

  setSymbol: (s: string) => void;
  setConnected: (b: boolean) => void;
  setBestPrices: (
    bestBid: number | null,
    bestAsk: number | null,
    bidSize: number,
    askSize: number,
  ) => void;
  setLadder: (bids: PriceLevel[], asks: PriceLevel[]) => void;
  pushTrade: (t: Trade) => void;
}

const TRADE_BUFFER = 80;

export const useMarketStore = create<MarketState>((set) => ({
  symbol: DEFAULT_SYMBOL,
  connected: false,
  bestBid: null,
  bestAsk: null,
  bidSize: 0,
  askSize: 0,
  bids: [],
  asks: [],
  trades: [],
  lastTradeTs: null,

  setSymbol: (symbol) => set({ symbol }),
  setConnected: (connected) => set({ connected }),
  setBestPrices: (bestBid, bestAsk, bidSize, askSize) =>
    set({ bestBid, bestAsk, bidSize, askSize }),
  setLadder: (bids, asks) => set({ bids, asks }),
  pushTrade: (trade) =>
    set((s) => {
      const next = [trade, ...s.trades];
      if (next.length > TRADE_BUFFER) next.length = TRADE_BUFFER;
      return { trades: next, lastTradeTs: trade.ts_ns };
    }),
}));

// ----- Latency telemetry -----------------------------------------------------

export interface SubmitSample {
  ns: number;
  filled: boolean;
}

interface LatencyState {
  samples: number[]; // recent submit-order round-trip in ns
  totalSubmitted: number;
  totalFilled: number;
  windowStart: number; // ms timestamp for throughput measurement
  windowOps: number;
  throughputOps: number; // EWMA ops/sec

  recordSubmit: (latency_ns: number, filled: boolean) => void;
  recordBatch: (batch: SubmitSample[]) => void;
  resetThroughputWindow: () => void;
  tickThroughput: () => void;
}

const LATENCY_BUFFER = 200;

export const useLatencyStore = create<LatencyState>((set, get) => ({
  samples: [],
  totalSubmitted: 0,
  totalFilled: 0,
  windowStart: typeof window !== "undefined" ? performance.now() : 0,
  windowOps: 0,
  throughputOps: 0,

  recordSubmit: (latency_ns, filled) =>
    set((s) => {
      const samples = [latency_ns, ...s.samples];
      if (samples.length > LATENCY_BUFFER) samples.length = LATENCY_BUFFER;
      return {
        samples,
        totalSubmitted: s.totalSubmitted + 1,
        totalFilled: s.totalFilled + (filled ? 1 : 0),
        windowOps: s.windowOps + 1,
      };
    }),

  recordBatch: (batch) => {
    if (batch.length === 0) return;
    set((s) => {
      // Newest at the front. Reverse the batch so the most recent sample lands first.
      const incoming: number[] = new Array(batch.length);
      let filled = 0;
      for (let i = 0; i < batch.length; i++) {
        incoming[batch.length - 1 - i] = batch[i].ns;
        if (batch[i].filled) filled++;
      }
      const samples = incoming.concat(s.samples);
      if (samples.length > LATENCY_BUFFER) samples.length = LATENCY_BUFFER;
      return {
        samples,
        totalSubmitted: s.totalSubmitted + batch.length,
        totalFilled: s.totalFilled + filled,
        windowOps: s.windowOps + batch.length,
      };
    });
  },

  resetThroughputWindow: () =>
    set({
      windowStart: performance.now(),
      windowOps: 0,
    }),

  tickThroughput: () => {
    const s = get();
    const now = performance.now();
    const elapsed = (now - s.windowStart) / 1000;
    if (elapsed <= 0) return;
    const rate = s.windowOps / elapsed;
    // EWMA toward new rate, sharper alpha for responsiveness
    const ewma = s.throughputOps * 0.4 + rate * 0.6;
    set({
      throughputOps: ewma,
      windowStart: now,
      windowOps: 0,
    });
  },
}));

// Percentile helper for the latency HUD
export function percentile(samples: number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

// ----- Sim controls ----------------------------------------------------------

export type BotProfile = "makers" | "takers";

interface SimState {
  running: boolean;
  makerCount: number;
  takerCount: number;
  /** Aggression 0-100 — higher = wider spreads from makers, more cross attempts from takers. */
  aggression: number;
  /** Tick rate (ms between bot actions) — lower = faster. */
  tickMs: number;

  setRunning: (b: boolean) => void;
  setMakerCount: (n: number) => void;
  setTakerCount: (n: number) => void;
  setAggression: (n: number) => void;
  setTickMs: (n: number) => void;
}

export const useSimStore = create<SimState>((set) => ({
  running: false,
  makerCount: 12,
  takerCount: 6,
  aggression: 45,
  tickMs: 50,

  setRunning: (running) => set({ running }),
  setMakerCount: (makerCount) =>
    set({ makerCount: Math.max(0, Math.min(200, makerCount)) }),
  setTakerCount: (takerCount) =>
    set({ takerCount: Math.max(0, Math.min(100, takerCount)) }),
  setAggression: (aggression) =>
    set({ aggression: Math.max(0, Math.min(100, aggression)) }),
  setTickMs: (tickMs) => set({ tickMs: Math.max(10, Math.min(1000, tickMs)) }),
}));
