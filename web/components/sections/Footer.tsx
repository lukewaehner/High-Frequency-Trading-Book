import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-line-soft bg-bg">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-6 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <div className="flex flex-col gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber">
            HFTX
          </span>
          <p className="max-w-[44ch] text-[12px] leading-relaxed text-fg-muted">
            A high-frequency order book engine in Rust, with a live trading
            simulator. Open source. Built by Luke Waehner.
          </p>
        </div>

        <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-dim md:items-end">
          <Link
            href="https://github.com/lukewaehner/hft-ledger"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-fg"
          >
            GitHub →
          </Link>
          <span>Rust · Axum · tokio · Next.js</span>
          <span className="text-fg-dim/60">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
