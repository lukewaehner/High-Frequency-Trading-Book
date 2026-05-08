"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { useRef, type ReactNode } from "react";

// Wrap an inline-block element to give it a soft pull toward the cursor.
// Movement is bounded by `radius`. Spring physics (no bounce overshoot).
//
// Pointer-only — touch devices skip the effect.
export function Magnetic({
  children,
  radius = 8,
  className,
}: {
  children: ReactNode;
  radius?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const xSmooth = useSpring(x, { stiffness: 220, damping: 24, mass: 0.6 });
  const ySmooth = useSpring(y, { stiffness: 220, damping: 24, mass: 0.6 });

  if (reduced) {
    return <span className={className}>{children}</span>;
  }

  const handleMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    x.set(Math.max(-1, Math.min(1, dx)) * radius);
    y.set(Math.max(-1, Math.min(1, dy)) * radius);
  };

  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <span
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={className}
      style={{ display: "inline-block" }}
    >
      <motion.span
        style={{ x: xSmooth, y: ySmooth, display: "inline-block" }}
      >
        {children}
      </motion.span>
    </span>
  );
}
