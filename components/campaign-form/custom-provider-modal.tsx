"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Header = { key: string; value: string };

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * UI-only modal. Nothing persists — collecting fields for future work.
 * Closes on Esc, backdrop click, or "Cancel"/"Save" (save is a no-op today).
 */
export function CustomProviderModal({ open, onClose }: Props) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [authType, setAuthType] = useState<"none" | "bearer" | "basic">("none");
  const [headers, setHeaders] = useState<Header[]>([{ key: "", value: "" }]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const reset = () => {
    setName("");
    setUrl("");
    setMethod("GET");
    setAuthType("none");
    setHeaders([{ key: "", value: "" }]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-border px-5 py-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Custom HTTP provider</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Describe an endpoint. We&apos;ll wire it up in a future pass.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <Field label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Internal CRM"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
            />
          </Field>

          <Field label="URL">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://api.example.com/contacts"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40font-mono text-[12px]"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as "GET" | "POST")}
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </Field>
            <Field label="Auth">
              <select
                value={authType}
                onChange={(e) =>
                  setAuthType(e.target.value as "none" | "bearer" | "basic")
                }
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic auth</option>
              </select>
            </Field>
          </div>

          <Field label="Headers">
            <div className="space-y-1.5">
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={h.key}
                    onChange={(e) =>
                      setHeaders((arr) =>
                        arr.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)),
                      )
                    }
                    placeholder="X-API-Key"
                    className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40flex-1 font-mono text-[11px]"
                  />
                  <input
                    type="text"
                    value={h.value}
                    onChange={(e) =>
                      setHeaders((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="••••"
                    className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40flex-1 font-mono text-[11px]"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setHeaders((arr) =>
                        arr.length === 1
                          ? [{ key: "", value: "" }]
                          : arr.filter((_, j) => j !== i),
                      )
                    }
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                    aria-label="Remove header"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setHeaders((arr) => [...arr, { key: "", value: "" }])}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> Add header
              </button>
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleClose} disabled={!name || !url}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      {children}
    </label>
  );
}
