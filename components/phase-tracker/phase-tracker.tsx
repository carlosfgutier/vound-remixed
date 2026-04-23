import Link from "next/link";
import { PHASES, phaseHref, type PhaseId } from "@/lib/phases";
import { cn } from "@/lib/utils";

type Props = {
  current: PhaseId;
  campaignId?: string;
  /**
   * The furthest phase the campaign has actually reached in the DB, regardless
   * of which phase the user is currently viewing. Phases up to and including
   * this index are rendered as completed (blue) even when viewing an earlier
   * phase.
   */
  maxReached?: PhaseId;
  /**
   * When true, every phase with a resolvable href becomes clickable regardless
   * of whether it is past/current/future. Callers pass this once the campaign
   * has finished Loading (i.e. `email_strategy` is populated) so the user can
   * bounce freely between Details, Loading, Preview, and Sequence from any
   * phase view.
   */
  unlockFuture?: boolean;
};

export function PhaseTracker({ current, campaignId, maxReached, unlockFuture }: Props) {
  const currentIndex = PHASES.find((p) => p.id === current)?.index ?? 1;
  const maxReachedIndex = PHASES.find((p) => p.id === maxReached)?.index ?? currentIndex;
  // Effective index for past/future styling: whichever is further along.
  const highWaterIndex = Math.max(currentIndex, maxReachedIndex);

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
          const isCompleted = !isCurrent && phase.index <= highWaterIndex;
          const isFuture = phase.index > highWaterIndex;
          const href = phaseHref(phase.id, campaignId);
          const interactive =
            href !== null && (isCurrent || isPast || isCompleted || postLoading);

          const dot = (
            <span
              className={cn(
                "relative z-10 flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-full border transition-colors",
                isCurrent && "border-accent bg-accent shadow-[0_0_0_3px_oklch(0.78_0.16_210_/_15%)]",
                isCompleted && !isCurrent && "border-accent/60 bg-accent/60",
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
                      phase.index <= highWaterIndex ? "bg-accent/40" : "bg-border",
                    )}
                  />
                )}
                {i < PHASES.length - 1 && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2",
                      phase.index < highWaterIndex ? "bg-accent/40" : "bg-border",
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
