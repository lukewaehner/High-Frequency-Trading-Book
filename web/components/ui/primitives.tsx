"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Magnetic } from "./Magnetic";

export function Pulse({
  on,
  className,
}: {
  on: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-1.5 w-1.5 rounded-full",
        on ? "bg-amber" : "bg-fg-dim",
        className,
      )}
      aria-hidden
    >
      {on && (
        <span className="absolute inset-0 rounded-full bg-amber pulse-dot" />
      )}
    </span>
  );
}

export function Hairline({ className }: { className?: string }) {
  return <div className={cn("hairline", className)} aria-hidden />;
}

export function StatLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10px] uppercase tracking-[0.18em] text-fg-dim font-mono">
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "default",
  align = "left",
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tone?: "default" | "amber" | "bid" | "ask";
  align?: "left" | "right";
}) {
  const toneClass =
    tone === "amber"
      ? "text-amber"
      : tone === "bid"
        ? "text-bid"
        : tone === "ask"
          ? "text-ask"
          : "text-fg";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        align === "right" && "items-end text-right",
      )}
    >
      <StatLabel>{label}</StatLabel>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-mono text-xl tracking-tight", toneClass)}>
          {value}
        </span>
        {unit && (
          <span className="font-mono text-xs text-fg-dim">{unit}</span>
        )}
      </div>
    </div>
  );
}

export function SectionLabel({
  index,
  title,
  className,
}: {
  index: string;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-[0.22em] text-fg-dim",
        className,
      )}
    >
      <span className="text-amber">{index}</span>
      <span>{title}</span>
    </div>
  );
}

// Amber CTA primitive with built-in magnetic pull. Renders as <a> when href is
// set, <button> otherwise. `lg` gets the hero proportions and outer glow; `md`
// is the in-section default. `magnetic={false}` opts out of the cursor pull.
export function MagneticButton({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className,
  type = "button",
  disabled,
  href,
  target,
  rel,
  magnetic = true,
  magneticRadius,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "outline" | "ghost";
  size?: "md" | "lg";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  href?: string;
  target?: string;
  rel?: string;
  magnetic?: boolean;
  magneticRadius?: number;
}) {
  const variants = {
    primary: "bg-amber text-bg hover:bg-amber-glow",
    outline:
      "border border-line text-fg-muted hover:border-fg-muted hover:text-fg",
    ghost: "text-fg-muted hover:text-fg",
  };

  const sizes = {
    md: "h-10 gap-2 px-5",
    lg: "h-11 gap-2.5 px-5",
  };

  const shadow =
    variant === "primary"
      ? size === "lg"
        ? "shadow-[inset_0_1px_0_oklch(1_0_0_/_0.18),inset_0_-1px_0_oklch(0_0_0_/_0.35),0_8px_28px_-10px_oklch(0.78_0.16_78_/_0.55)]"
        : "shadow-[var(--shadow-amber-inner)]"
      : "";

  const classes = cn(
    "group relative inline-flex items-center rounded-full font-mono text-xs uppercase tracking-[0.18em] transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
    sizes[size],
    variants[variant],
    shadow,
    className,
  );

  const inner = href ? (
    <a href={href} target={target} rel={rel} className={classes}>
      {children}
    </a>
  ) : (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={classes}
    >
      {children}
    </button>
  );

  if (!magnetic) return inner;

  return (
    <Magnetic radius={magneticRadius ?? (size === "lg" ? 6 : 5)}>
      {inner}
    </Magnetic>
  );
}
