"use client";

import { useRef, useState } from "react";
import {
  FileSpreadsheet,
  Globe,
  Webhook,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { parseCsvFile, hasEmailColumn } from "@/lib/csv/parse";
import type { ContactsInput } from "@/lib/schema/campaign-input";
import { cn } from "@/lib/utils";

const MODES = [
  {
    id: "csv" as const,
    icon: FileSpreadsheet,
    label: "CSV upload",
    description: "Drop a file with emails + any columns.",
    available: true,
  },
  {
    id: "webhook" as const,
    icon: Webhook,
    label: "Webhook",
    description: "Stream contacts in from your tools.",
    available: false,
  },
  {
    id: "http" as const,
    icon: Globe,
    label: "Custom HTTP",
    description: "Pull from your own endpoint.",
    available: false,
  },
];

type Props = {
  value: ContactsInput | null;
  onChange: (next: ContactsInput | null) => void;
  error?: string;
};

/**
 * Step-B picker. Three cards: CSV (functional), Webhook + HTTP (Soon).
 * The CSV card itself is the drop/click target — no separate dropzone below.
 */
export function ContactsSection({ value, onChange, error }: Props) {
  const [mode, setMode] = useState<ContactsInput["mode"]>("csv");
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    setFileName(file.name);
    const parsed = await parseCsvFile(file);
    if (parsed.errors.length > 0) {
      setParseError(parsed.errors[0]);
      onChange(null);
      return;
    }
    if (!hasEmailColumn(parsed.columns)) {
      setParseError("CSV must include an `email` column.");
      onChange(null);
      return;
    }
    if (parsed.records.length === 0) {
      setParseError("No rows found in this file.");
      onChange(null);
      return;
    }
    onChange({
      mode: "csv",
      records: parsed.records,
      detectedColumns: parsed.columns,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          const isCsv = m.id === "csv";
          const active = mode === m.id;
          const hasFile = isCsv && value;

          const onClick = () => {
            if (!m.available) return;
            setMode(m.id);
            if (isCsv) inputRef.current?.click();
          };

          return (
            <div
              key={m.id}
              onClick={onClick}
              role={m.available ? "button" : undefined}
              tabIndex={m.available ? 0 : undefined}
              onKeyDown={(e) => {
                if (m.available && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onClick();
                }
              }}
              onDragOver={
                isCsv
                  ? (e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }
                  : undefined
              }
              onDragLeave={isCsv ? () => setDragOver(false) : undefined}
              onDrop={
                isCsv
                  ? async (e) => {
                      e.preventDefault();
                      setDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) await handleFile(file);
                    }
                  : undefined
              }
              className={cn(
                "group flex aspect-square cursor-pointer flex-col justify-between rounded-lg border p-4 text-left transition",
                m.available
                  ? active
                    ? "border-accent/60 bg-accent/10 shadow-[var(--glow-accent)]"
                    : "border-border bg-surface/40 hover:border-border-strong hover:bg-surface"
                  : "cursor-not-allowed border-border bg-surface/20 opacity-60",
                isCsv && dragOver && "border-accent bg-accent/15",
                isCsv && hasFile && "border-success/50 bg-success/5",
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border",
                  active
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-surface text-foreground",
                  hasFile && "border-success/40 bg-success/10 text-success",
                )}
              >
                {hasFile ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  {m.label}
                  {!m.available && (
                    <span className="rounded-sm border border-border bg-surface px-1 py-[1px] font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      soon
                    </span>
                  )}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {hasFile && fileName ? (
                    <>
                      <span className="block font-mono text-foreground truncate">
                        {fileName}
                      </span>
                      <span className="text-muted-foreground">
                        {value.records.length} contacts ·{" "}
                        {value.detectedColumns.length} cols
                      </span>
                    </>
                  ) : (
                    m.description
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await handleFile(file);
        }}
      />

      {parseError && (
        <div className="flex items-start gap-1.5 font-mono text-[10px] text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
          {parseError}
        </div>
      )}

      {error && !parseError && (
        <p className="font-mono text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
