"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ExampleChips } from "./example-chips";

type Props = {
  label: string;
  htmlFor: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  examples: readonly string[];
  error?: string;
  rows?: number;
  hint?: string;
  maxLength?: number;
};

export function TextField({
  label,
  htmlFor,
  value,
  onChange,
  placeholder,
  examples,
  error,
  rows = 3,
  hint = "A sentence or two is plenty.",
  maxLength = 600,
}: Props) {
  const len = value.length;
  const warn = len > maxLength;

  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Textarea
        id={htmlFor}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={`${htmlFor}-hint`}
      />
      <div className="flex items-start justify-between gap-4">
        <ExampleChips examples={examples} onPick={onChange} className="flex-1" />
        <div
          id={`${htmlFor}-hint`}
          className="shrink-0 text-right font-mono text-[10px] text-muted-foreground"
        >
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <>
              <span className={warn ? "text-destructive" : ""}>{len}</span>
              <span className="text-muted-foreground/60"> · {hint}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
