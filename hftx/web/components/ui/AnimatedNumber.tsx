"use client";

import { useEffect, useRef, useState } from "react";

// Smoothly animates between number values without re-rendering the parent.
// Uses RAF with exponential easing toward the target.
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 240,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const startRef = useRef<number | null>(null);
  const targetRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    fromRef.current = display;
    targetRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const start = startRef.current ?? now;
      const t = Math.min(1, (now - start) / duration);
      // ease-out quint
      const eased = 1 - Math.pow(1 - t, 5);
      const next = fromRef.current + (targetRef.current - fromRef.current) * eased;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}
