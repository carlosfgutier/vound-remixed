"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string };

type Props = {
  steps: readonly Step[];
  currentStep: string;
  onBack?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  nextDisabled?: boolean;
  submitDisabled?: boolean;
  isLast: boolean;
  children: React.ReactNode;
  heading: string;
  subheading?: string;
};

export function WizardShell({
  steps,
  currentStep,
  onBack,
  onNext,
  onSubmit,
  submitLabel = "Submit",
  nextDisabled,
  submitDisabled,
  isLast,
  children,
  heading,
  subheading,
}: Props) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex flex-col gap-6">
      {/* Step dots */}
      <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => {
          const isCurrent = s.id === currentStep;
          const isPast = i < currentIndex;
          return (
            <div
              key={s.id}
              className={cn(
                "h-1.5 w-8 rounded-full transition-colors",
                isCurrent && "bg-accent",
                isPast && "bg-accent/50",
                !isCurrent && !isPast && "bg-border",
              )}
              aria-current={isCurrent ? "step" : undefined}
            />
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-surface/40 p-8 min-h-[360px]">
        <div className="mb-6">
          <h2 className="text-base font-medium text-foreground">{heading}</h2>
          {subheading && (
            <p className="mt-1 text-[12px] text-muted-foreground">{subheading}</p>
          )}
        </div>
        {children}
      </div>

      {/* Arrow nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className={cn(
            "group inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition hover:text-foreground hover:border-border-strong",
            !onBack && "invisible",
          )}
          aria-label="Previous step"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-6 text-xs font-medium text-background transition hover:bg-foreground/90 disabled:opacity-50"
          >
            {submitLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-accent/60 bg-accent text-accent-foreground transition hover:bg-accent/90 disabled:opacity-40 disabled:bg-surface disabled:text-muted-foreground disabled:border-border"
            aria-label="Next step"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
