"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type Props = {
  anchor: { x: number; y: number };
  value: unknown;
  fieldTitle: string;
  source?: string | null;
  onClose: () => void;
};

/**
 * Minimal lightweight popover. Pinned to a double-click position and dismissed
 * on outside click / Escape. Beats sticky Status column via z-50.
 */
export function CellPopover({ anchor, value, fieldTitle, source, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer attaching so the click that opened us doesn't immediately close.
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const rendered = stringify(value);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Cell detail: ${fieldTitle}`}
      className={cn(
        "fixed z-50 w-[320px] max-w-[90vw] overflow-hidden rounded-md border border-border bg-background shadow-lg",
      )}
      style={{
        left: clamp(anchor.x, 16, viewportWidth() - 336),
        top: clamp(anchor.y + 8, 16, viewportHeight() - 240),
      }}
    >
      <div className="border-b border-border bg-surface/60 px-3 py-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {fieldTitle}
        </div>
      </div>
      <div className="max-h-[280px] overflow-auto px-3 py-3 text-[12px] leading-relaxed text-foreground">
        {rendered === "" ? (
          <span className="text-muted-foreground/60">Empty</span>
        ) : (
          <pre className="whitespace-pre-wrap break-words font-sans">{rendered}</pre>
        )}
      </div>
      {source && (
        <div className="border-t border-border bg-surface/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]">
            Source
          </span>
          <span className="ml-2">{source}</span>
        </div>
      )}
    </div>
  );
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
function viewportWidth(): number {
  return typeof window === "undefined" ? 1024 : window.innerWidth;
}
function viewportHeight(): number {
  return typeof window === "undefined" ? 768 : window.innerHeight;
}
