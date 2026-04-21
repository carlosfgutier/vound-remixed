import Link from "next/link";
import { PHASES, phaseHref, type PhaseId } from "@/lib/phases";
import { cn } from "@/lib/utils";

type Props = {
  current: PhaseId;
  campaignId?: string;
  /**
   * When true, every phase with a resolvable href becomes clickable regardless
   * of whether it is past/current/future. Callers pass this once the campaign
   * has finished Loading (i.e. `email_strategy` is populated) so the user can
   * bounce freely between Details, Loading, Preview, and Sequence from any
   * phase view.
   */
  unlockFuture?: boolean;
};

export function PhaseTracker({ current, campaignId, unlockFuture }: Props) {
  const currentIndex = PHASES.find((p) => p.id === current)?.index ?? 1;

  // Auto-unlock heuristic: if we're already on Preview or Sequence, Loading
  // has obviously completed. Callers on Details pass `unlockFuture` explicitly
  // because `current === "details"` can't distinguish a fresh campaign from a
  // finished one.
  const postLoading =
    unlockFuture === true || current === "preview" || current === "sequence";

  return (
    <nav aria-label="Campaign phases" className="w-full">
      <ol className="flex items-start justify-between gap-2">
        {PHASES.map((phase, i) => {
          const isCurrent = phase.id === current;
          const isPast = phase.index < currentIndex;
          const isFuture = phase.index > currentIndex;
          const href = phaseHref(phase.id, campaignId);
          const interactive =
            href !== null && (isCurrent || isPast || postLoading);

          const dot = (
            <span
              className={cn(
                "relative z-10 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                isCurrent && "border-accent bg-accent shadow-[0_0_0_3px_oklch(0.78_0.16_210_/_15%)]",
                isPast && "border-accent/60 bg-accent/60",
                isFuture && "border-border bg-surface",
              )}
            />
          );

          const label = (
            <span
              className={cn(
                "mt-2 text-[10px] font-mono uppercase tracking-[0.08em]",
                isCurrent && "text-foreground",
                !isCurrent && interactive && "text-muted-foreground",
                !isCurrent && !interactive && "text-muted-foreground/60",
              )}
            >
              {String(phase.index).padStart(2, "0")} · {phase.label}
            </span>
          );

          return (
            <li key={phase.id} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="relative flex w-full items-center justify-center">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2",
                      phase.index <= currentIndex ? "bg-accent/40" : "bg-border",
                    )}
                  />
                )}
                {i < PHASES.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2",
                      phase.index < currentIndex ? "bg-accent/40" : "bg-border",
                    )}
                  />
                )}
                {dot}
              </div>
              {interactive ? (
                <Link
                  href={href}
                  className="flex flex-col items-center rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {label}
                </Link>
              ) : (
                <div
                  className="flex flex-col items-center"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {label}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
