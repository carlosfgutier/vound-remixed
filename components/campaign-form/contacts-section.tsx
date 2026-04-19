"use client";

import { useRef, useState } from "react";
import {
  FileSpreadsheet,
  Globe,
  Upload,
  UserPlus,
  Webhook,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { Label } from "@/components/ui/label";
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
    id: "individual" as const,
    icon: UserPlus,
    label: "Add manually",
    description: "Paste or type one at a time.",
    available: false,
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

  const clearFile = () => {
    setFileName(null);
    setParseError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <Label>Contacts</Label>

      {/* Mode picker */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={!m.available}
              onClick={() => m.available && setMode(m.id)}
              className={cn(
                "group flex h-full flex-col items-start gap-2 rounded-lg border p-3 text-left transition",
                active
                  ? "border-accent/60 bg-accent/10 shadow-[var(--glow-accent)]"
                  : "border-border bg-surface/40 hover:border-border-strong hover:bg-surface",
                !m.available && "cursor-not-allowed opacity-50",
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border",
                  active
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border bg-surface text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                {m.label}
                {!m.available && (
                  <span className="rounded-sm border border-border bg-surface px-1 py-[1px] font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    soon
                  </span>
                )}
              </div>
              <div className="text-[11px] leading-relaxed text-muted-foreground">
                {m.description}
              </div>
            </button>
          );
        })}
      </div>

      {/* CSV dropzone */}
      {mode === "csv" && (
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) await handleFile(file);
            }}
            className={cn(
              "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition",
              dragOver
                ? "border-accent/60 bg-accent/10"
                : value
                  ? "border-success/50 bg-success/5"
                  : "border-border bg-surface/30 hover:border-border-strong hover:bg-surface/50",
            )}
          >
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
            {value && fileName ? (
              <>
                <CheckCircle2 className="h-6 w-6 text-success" />
                <div className="text-sm text-foreground">
                  <span className="font-mono">{fileName}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {value.records.length} contacts · {value.detectedColumns.length}{" "}
                  columns detected
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Remove
                </button>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <div className="text-sm text-foreground">
                  Drop a CSV here, or click to browse
                </div>
                <div className="text-[11px] text-muted-foreground">
                  We auto-detect columns.{" "}
                  <span className="font-mono text-foreground">email</span> is required.
                </div>
              </>
            )}
          </div>

          {parseError && (
            <div className="mt-2 flex items-start gap-1.5 font-mono text-[10px] text-destructive">
              <AlertCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
              {parseError}
            </div>
          )}

          {value && (
            <DetectedColumns columns={value.detectedColumns} />
          )}
        </div>
      )}

      {error && !parseError && (
        <p className="font-mono text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}

function DetectedColumns({ columns }: { columns: string[] }) {
  return (
    <div className="mt-3 rounded-md border border-border bg-surface/40 p-3">
      <div className="label-mono mb-2">Detected columns</div>
      <div className="flex flex-wrap gap-1.5">
        {columns.map((c) => {
          const isEmail = c.toLowerCase() === "email";
          return (
            <span
              key={c}
              className={cn(
                "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px]",
                isEmail
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted-foreground",
              )}
            >
              {c}
            </span>
          );
        })}
      </div>
    </div>
  );
}
