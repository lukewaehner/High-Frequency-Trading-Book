"use client";

import { useAnimationControls, useReducedMotion } from "framer-motion";
import { useEffect, useRef } from "react";

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1] as const;

export function useFlashOnChange(
  key: string | number | undefined,
  glow: string,
  blur = 16,
  duration = 0.45,
) {
  const reduced = useReducedMotion();
  const controls = useAnimationControls();
  const prev = useRef(key);

  useEffect(() => {
    if (reduced) return;
    if (key === undefined) return;
    if (prev.current !== undefined && prev.current !== key) {
      controls.start({
        textShadow: [`0 0 ${blur}px ${glow}`, "0 0 0px transparent"],
        transition: { duration, ease: EASE_OUT_QUINT },
      });
    }
    prev.current = key;
  }, [key, glow, blur, duration, reduced, controls]);

  return controls;
}
