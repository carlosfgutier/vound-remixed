"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  examples: readonly string[];
  onPick: (value: string) => void;
  className?: string;
};

export function ExampleChips({ examples, onPick, className }: Props) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {examples.map((example, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onPick(example)}
          className={cn(
            "group inline-flex max-w-full items-center gap-1.5 rounded-full",
            "border border-border bg-surface/40 px-2.5 py-1",
            "text-[11px] leading-tight text-muted-foreground",
            "hover:border-accent/40 hover:bg-accent/5 hover:text-foreground",
            "transition",
          )}
          title="Click to prefill"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-accent/70 group-hover:text-accent" />
          <span className="truncate">{example}</span>
        </button>
      ))}
    </div>
  );
}
