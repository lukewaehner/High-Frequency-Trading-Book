"use client";

import { useEffect, useRef } from "react";
import { openLatencyStream, submitOrderBatch } from "@/lib/exchange";
import {
  SEED_MID_TICKS,
  type SubmitSample,
  useLatencyStore,
  useMarketStore,
  useSimStore,
} from "@/lib/store";
import type { Side } from "@/lib/types";

// Cap on simultaneous in-flight batch requests. Each batch carries an entire
// tick's orders, so 2 is enough to absorb a slow round-trip without queueing
// up unbounded backlog when the user cranks tick rate or order counts.
const MAX_INFLIGHT_BATCHES = 2;

type Order = { side: Side; price: number; quantity: number };

export function SimEngine() {
  const running = useSimStore((s) => s.running);
  const mode = useSimStore((s) => s.mode);
  const makerCount = useSimStore((s) => s.makerCount);
  const takerCount = useSimStore((s) => s.takerCount);
  const aggression = useSimStore((s) => s.aggression);
  const tickMs = useSimStore((s) => s.tickMs);

  const recordBatch = useLatencyStore((s) => s.recordBatch);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(0);
  const droppedRef = useRef(0);
  // Buffer samples produced by fire-and-forget submissions; flushed via RAF.
  const pendingRef = useRef<SubmitSample[]>([]);

  // RAF flush loop: pushes accumulated samples into the store at ~60Hz
  // instead of once per submission. Keeps render pressure bounded.
  useEffect(() => {
    let raf = 0;
    const flush = () => {
      if (pendingRef.current.length > 0) {
        const batch = pendingRef.current;
        pendingRef.current = [];
        recordBatch(batch);
      }
      raf = requestAnimationFrame(flush);
    };
    raf = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(raf);
  }, [recordBatch]);

  // Browser-side driver: only active when mode === "browser".
  useEffect(() => {
    if (mode !== "browser" || !running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const dispatchBatch = (orders: Order[]) => {
      if (orders.length === 0) return;
      if (inflightRef.current >= MAX_INFLIGHT_BATCHES) {
        droppedRef.current += orders.length;
        return;
      }
      inflightRef.current++;
      const symbol = useMarketStore.getState().symbol;
      submitOrderBatch(symbol, orders)
        .then((res) => {
          for (let i = 0; i < res.results.length; i++) {
            const r = res.results[i];
            pendingRef.current.push({ ns: r.latency_ns, filled: r.filled });
          }
        })
        .catch(() => {
          // engine offline / 404 — drop silently
        })
        .finally(() => {
          inflightRef.current--;
        });
    };

    const tick = () => {
      const m = useMarketStore.getState();
      const referenceMid =
        m.bestBid && m.bestAsk
          ? Math.round((m.bestBid + m.bestAsk) / 2)
          : SEED_MID_TICKS;
      const aggrFactor = aggression / 100;

      const orders: Order[] = [];

      for (let i = 0; i < makerCount; i++) {
        const halfSpread = Math.max(
          1,
          Math.round(8 - aggrFactor * 6 + Math.random() * 5),
        );
        const offset = Math.round(Math.random() * halfSpread);
        const side: Side = Math.random() < 0.5 ? "Bid" : "Ask";
        const price =
          side === "Bid" ? referenceMid - offset : referenceMid + offset;
        const quantity = 10 + Math.floor(Math.random() * 80);
        orders.push({ side, price, quantity });
      }

      for (let i = 0; i < takerCount; i++) {
        const willCross = Math.random() < 0.35 + aggrFactor * 0.55;
        const side: Side = Math.random() < 0.5 ? "Bid" : "Ask";
        let price: number;
        if (willCross) {
          if (side === "Bid")
            price =
              (m.bestAsk ?? referenceMid + 4) +
              Math.round(Math.random() * 4);
          else
            price =
              (m.bestBid ?? referenceMid - 4) -
              Math.round(Math.random() * 4);
        } else {
          if (side === "Bid") price = m.bestBid ?? referenceMid - 1;
          else price = m.bestAsk ?? referenceMid + 1;
        }
        const quantity = 5 + Math.floor(Math.random() * 50);
        orders.push({ side, price, quantity });
      }

      dispatchBatch(orders);
    };

    intervalRef.current = setInterval(tick, tickMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mode, running, makerCount, takerCount, aggression, tickMs]);

  // Server-side driver: subscribe to the latency sample stream and feed it
  // into the same latency store the browser-side path writes to. Server
  // start/stop is handled by the Sim section's run-toggle; here we only
  // mirror the metrics.
  useEffect(() => {
    if (mode !== "server") return;
    const symbol = useMarketStore.getState().symbol;
    const handle = openLatencyStream(symbol, (sample) => {
      pendingRef.current.push({ ns: sample.latency_ns, filled: sample.filled });
    });
    return () => handle.close();
  }, [mode]);

  return null;
}
