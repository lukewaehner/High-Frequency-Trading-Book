"use client";

import { useEffect, useRef } from "react";
import { submitOrderTimed } from "@/lib/exchange";
import {
  SEED_MID_TICKS,
  type SubmitSample,
  useLatencyStore,
  useMarketStore,
  useSimStore,
} from "@/lib/store";
import type { Side } from "@/lib/types";

// Cap on simultaneous in-flight HTTP requests to avoid unbounded queue growth.
// Browsers limit HTTP/1.1 to ~6 concurrent connections per origin, so anything
// past that queues at the network layer regardless. We cap higher to absorb
// burst spikes without dropping ticks too aggressively.
const MAX_INFLIGHT = 256;

type Order = { side: Side; price: number; quantity: number };

export function SimEngine() {
  const running = useSimStore((s) => s.running);
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

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const dispatch = (order: Order) => {
      if (inflightRef.current >= MAX_INFLIGHT) {
        droppedRef.current++;
        return;
      }
      inflightRef.current++;
      const symbol = useMarketStore.getState().symbol;
      submitOrderTimed(symbol, order)
        .then((res) => {
          pendingRef.current.push({
            ns: res.latency_ns,
            filled: res.trades.length > 0,
          });
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

      // Build all orders for this tick synchronously, then dispatch in parallel.
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

      // Fire all in parallel, fire-and-forget. Latency samples buffer to
      // pendingRef and are batched into the store on the next RAF.
      for (let i = 0; i < orders.length; i++) {
        dispatch(orders[i]);
      }
    };

    intervalRef.current = setInterval(tick, tickMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, makerCount, takerCount, aggression, tickMs]);

  return null;
}
