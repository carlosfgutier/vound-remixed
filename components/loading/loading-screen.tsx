"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shuffledWittyMessages } from "@/lib/loading/witty-messages";

type Props = {
  campaignId: string;
  initialEnrichmentRunId: string | null;
  initialStrategyRunId: string | null;
};

/**
 * Loading screen. While we wait for Phases 2–4 to complete in the background,
 * we cycle witty messages and listen for completion via three layers:
 *   1. Subscribe to the strategy workflow's ndjson stream (primary).
 *   2. Fall back to polling /status every 2s until strategyDone flips.
 *   3. After 60s with no progress, surface a "try again" escape hatch.
 */
export function LoadingScreen({
  campaignId,
  initialEnrichmentRunId,
  initialStrategyRunId,
}: Props) {
  const router = useRouter();
  const [messages] = useState(() => shuffledWittyMessages());
  const [messageIdx, setMessageIdx] = useState(0);
  const [stuck, setStuck] = useState(false);
  const doneRef = useRef(false);

  // Cycle the witty message every ~3s.
  useEffect(() => {
    const t = setInterval(() => {
      setMessageIdx((i) => (i + 1) % messages.length);
    }, 3000);
    return () => clearInterval(t);
  }, [messages.length]);

  // 60s "stuck" timer.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!doneRef.current) setStuck(true);
    }, 60_000);
    return () => clearTimeout(t);
  }, []);

  // Completion detection.
  useEffect(() => {
    let cancelled = false;

    const complete = () => {
      if (cancelled || doneRef.current) return;
      doneRef.current = true;
      router.push(`/campaigns/${campaignId}/preview?tab=fields`);
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/status`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          enrichmentRunId: string | null;
          strategyRunId: string | null;
          strategyDone: boolean;
        };
      } catch {
        return null;
      }
    };

    // Poll loop (2s). Exits as soon as strategyDone or we start streaming.
    const pollInterval = setInterval(async () => {
      if (cancelled || doneRef.current) return;
      const s = await poll();
      if (!s) return;
      if (s.strategyDone) complete();
    }, 2000);

    // Kick off an initial poll immediately so we don't wait 2s.
    void poll().then((s) => {
      if (s?.strategyDone) complete();
    });

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [campaignId, initialEnrichmentRunId, initialStrategyRunId, router]);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center px-8 py-16">
      <BeeTrail />

      <div className="relative z-10 mt-8 flex flex-col items-center gap-2 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Working
        </div>
        <div
          key={messageIdx}
          className="min-h-[32px] text-base font-medium text-foreground animate-in fade-in duration-500"
        >
          {messages[messageIdx]}
        </div>
        <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          We&apos;re researching your accounts, defining the schema, and drafting
          the sequence. Hang tight — usually a minute or two.
        </p>
      </div>

      {stuck && (
        <div className="relative z-10 mt-10 flex flex-col items-center gap-2 rounded-md border border-border bg-surface/40 px-4 py-3 text-center">
          <div className="text-[12px] text-muted-foreground">
            Taking longer than usual.
          </div>
          <button
            onClick={() => router.refresh()}
            className="text-[12px] font-medium text-accent hover:underline"
          >
            Check again
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Dashed journey trail (matches sketch IMG_8100). Pure CSS/SVG, no deps.
 */
function BeeTrail() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-60"
      viewBox="0 0 800 400"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <pattern id="dots" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.6" fill="currentColor" className="text-muted-foreground" />
        </pattern>
      </defs>
      <path
        d="M120 280 C 220 220, 320 320, 420 240 S 640 180, 700 140"
        stroke="currentColor"
        className="text-accent/60"
        strokeWidth="1"
        strokeDasharray="4 6"
        fill="none"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-40"
          dur="2s"
          repeatCount="indefinite"
        />
      </path>
      <circle
        cx="700"
        cy="140"
        r="5"
        className="fill-accent"
      />
    </svg>
  );
}
