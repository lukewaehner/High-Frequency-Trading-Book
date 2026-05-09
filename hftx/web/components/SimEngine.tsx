"use client";

import { useEffect, useRef } from "react";
import { openOrderStream, type OrderStreamHandle } from "@/lib/exchange";
import {
  SEED_MID_TICKS,
  type SubmitSample,
  useLatencyStore,
  useMarketStore,
  useSimStore,
} from "@/lib/store";
import type { Side } from "@/lib/types";

type Order = { side: Side; price: number; quantity: number };

// Skip a tick if the WS send buffer is bigger than this. Roughly one fat
// batch — back-pressure surrogate now that we don't track in-flight requests.
const BUFFERED_SKIP_THRESHOLD = 64 * 1024;

export function SimEngine() {
  const running = useSimStore((s) => s.running);
  const makerCount = useSimStore((s) => s.makerCount);
  const takerCount = useSimStore((s) => s.takerCount);
  const aggression = useSimStore((s) => s.aggression);
  const tickMs = useSimStore((s) => s.tickMs);

  const recordBatch = useLatencyStore((s) => s.recordBatch);

  const pendingRef = useRef<SubmitSample[]>([]);

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
    if (!running) return;

    const symbol = useMarketStore.getState().symbol;

    const handle: OrderStreamHandle = openOrderStream(
      symbol,
      (_seq, results) => {
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          pendingRef.current.push({ ns: r.latency_ns, filled: r.filled });
        }
      },
    );

    let timer: ReturnType<typeof setTimeout> | null = null;

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

      if (
        orders.length > 0 &&
        handle.isOpen &&
        handle.bufferedAmount < BUFFERED_SKIP_THRESHOLD
      ) {
        handle.send(orders);
      }

      timer = setTimeout(tick, useSimStore.getState().tickMs);
    };

    timer = setTimeout(tick, tickMs);

    return () => {
      if (timer) clearTimeout(timer);
      handle.close();
    };
  }, [running, makerCount, takerCount, aggression, tickMs]);

  return null;
}
