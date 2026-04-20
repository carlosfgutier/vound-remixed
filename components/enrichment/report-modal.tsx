"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  campaignName: string;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; markdown: string };

export function ReportModal({ open, onClose, campaignId, campaignName }: Props) {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const fetchedRef = useRef(false);

  const fetchReport = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/report`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          (body as { error?: string }).error ?? `Report failed (${res.status})`;
        setState({ status: "error", message: msg });
        return;
      }
      const body = (await res.json()) as { markdown: string };
      setState({ status: "ready", markdown: body.markdown });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Report failed",
      });
    }
  }, [campaignId]);

  // Fetch on first open.
  useEffect(() => {
    if (!open) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void fetchReport();
  }, [open, fetchReport]);

  // Reset cache when modal closes so next open regenerates (optional — here
  // we keep it cached across opens until the user hits "Regenerate").
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const download = useCallback(
    (extension: "md" | "txt") => {
      if (state.status !== "ready") return;
      const slug = campaignName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "enrichment-report";
      const mime = extension === "md" ? "text/markdown" : "text/plain";
      const blob = new Blob([state.markdown], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-enrichment-report.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [state, campaignName],
  );

  const regenerate = useCallback(() => {
    fetchedRef.current = true;
    void fetchReport();
  }, [fetchReport]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Enrichment
            </div>
            <h2 className="mt-0.5 text-sm font-medium text-foreground">
              Preview results
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={state.status === "loading"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition",
                state.status === "loading"
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-surface hover:text-foreground",
              )}
              title="Regenerate report"
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3",
                  state.status === "loading" && "animate-spin",
                )}
              />
              Regenerate
            </button>
            <button
              type="button"
              onClick={() => download("md")}
              disabled={state.status !== "ready"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition",
                state.status === "ready"
                  ? "text-foreground hover:bg-surface"
                  : "cursor-not-allowed text-muted-foreground opacity-60",
              )}
            >
              <Download className="h-3 w-3" />
              .md
            </button>
            <button
              type="button"
              onClick={() => download("txt")}
              disabled={state.status !== "ready"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition",
                state.status === "ready"
                  ? "text-foreground hover:bg-surface"
                  : "cursor-not-allowed text-muted-foreground opacity-60",
              )}
            >
              <Download className="h-3 w-3" />
              .txt
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground transition hover:bg-surface hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state.status === "loading" && (
            <div className="flex h-48 items-center justify-center gap-2 text-[12px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating report…
            </div>
          )}
          {state.status === "error" && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
              {state.message}
            </div>
          )}
          {state.status === "ready" && (
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground">
              {state.markdown}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
