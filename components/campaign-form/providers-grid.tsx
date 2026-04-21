"use client";

import { useState } from "react";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomProviderModal } from "./custom-provider-modal";
import { BUILT_IN_PROVIDERS, type Provider } from "./providers";

export { BUILT_IN_PROVIDERS, type Provider };

type Props = {
  value: string[];
  onChange: (next: string[]) => void;
};

export function ProvidersGrid({ value, onChange }: Props) {
  const [modalOpen, setModalOpen] = useState(false);

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((v) => v !== id));
    else onChange([...value, id]);
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {BUILT_IN_PROVIDERS.map((p) => {
          const active = value.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={cn(
                "relative flex aspect-square flex-col items-start justify-between rounded-lg border p-3 text-left transition",
                active
                  ? "border-accent/60 bg-accent/10 shadow-[var(--glow-accent)]"
                  : "border-border bg-surface/40 hover:border-border-strong hover:bg-surface",
              )}
            >
              {active && (
                <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </div>
              )}
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border font-mono text-[10px] font-medium",
                  active
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-surface text-foreground",
                )}
              >
                {p.label.slice(0, 2).toUpperCase()}
              </div>
              <div className="w-full">
                <div className="text-[12px] font-medium text-foreground">{p.label}</div>
                {p.description && (
                  <div className="text-[10px] leading-tight text-muted-foreground">
                    {p.description}
                  </div>
                )}
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface/20 text-muted-foreground transition hover:border-border-strong hover:bg-surface hover:text-foreground"
        >
          <Plus className="h-5 w-5" />
          <div className="text-[11px] font-medium">Custom HTTP</div>
        </button>
      </div>

      <CustomProviderModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
