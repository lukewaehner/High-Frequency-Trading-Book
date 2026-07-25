"use client";

import {
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Transition,
  type Variants,
} from "framer-motion";
import { type ReactNode } from "react";

// Brand-register entrance motion. Uses Framer's `whileInView` so reveals fire
// once as a section enters the viewport. Reduced-motion users get a crossfade
// with no spatial movement.

const EASE_OUT_EXPO: Transition["ease"] = [0.16, 1, 0.3, 1];

const baseTransition: Transition = {
  duration: 0.7,
  ease: EASE_OUT_EXPO,
};

const fromBelow: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: baseTransition },
};

const fromLeft: Variants = {
  hidden: { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: baseTransition },
};

const justFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.5, ease: EASE_OUT_EXPO } },
};

const VARIANT_MAP = {
  up: fromBelow,
  left: fromLeft,
  fade: justFade,
} as const;

type Direction = keyof typeof VARIANT_MAP;

export function Reveal({
  children,
  direction = "up",
  delay = 0,
  className,
  amount = 0.4,
  once = true,
  ...rest
}: {
  children: ReactNode;
  direction?: Direction;
  delay?: number;
  className?: string;
  amount?: number;
  once?: boolean;
} & Omit<HTMLMotionProps<"div">, "variants" | "initial" | "whileInView">) {
  const reduced = useReducedMotion();
  const variants = reduced ? justFade : VARIANT_MAP[direction];

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      transition={{ ...baseTransition, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

// Stagger container — wrap a group of children to cascade their reveals.
// Children should be plain elements, not <Reveal /> (those have their own
// initial/animate). Use `RevealItem` instead.
export function RevealStagger({
  children,
  className,
  stagger = 0.08,
  delayChildren = 0,
  amount = 0.3,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  amount?: number;
  once?: boolean;
}) {
  const reduced = useReducedMotion();
  const variants: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.4, ease: EASE_OUT_EXPO },
        },
      }
    : {
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren,
          },
        },
      };

  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({
  children,
  className,
  direction = "up",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  direction?: Direction;
} & Omit<HTMLMotionProps<"div">, "variants">) {
  const reduced = useReducedMotion();
  const variants = reduced ? justFade : VARIANT_MAP[direction];
  return (
    <motion.div className={className} variants={variants} {...rest}>
      {children}
    </motion.div>
  );
}

// Page-load entrance — used by the Hero. Doesn't wait for viewport.
export function PageLoadStagger({
  children,
  className,
  stagger = 0.09,
  delayChildren = 0.05,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}) {
  const reduced = useReducedMotion();
  const variants: Variants = reduced
    ? {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { duration: 0.4, ease: EASE_OUT_EXPO },
        },
      }
    : {
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren,
          },
        },
      };
  return (
    <motion.div
      className={className}
      variants={variants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}
