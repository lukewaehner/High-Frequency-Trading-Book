"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

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

export function MagneticButton({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const variants = {
    primary:
      "bg-amber text-bg hover:bg-amber-glow shadow-[var(--shadow-amber-inner)]",
    secondary:
      "bg-bg-elevated text-fg border border-line hover:border-fg-muted",
    ghost: "text-fg-muted hover:text-fg",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative inline-flex h-10 items-center gap-2 rounded-full px-5 font-mono text-xs uppercase tracking-[0.18em] transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}
