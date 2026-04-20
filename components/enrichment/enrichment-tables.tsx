"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, FileText, Loader2, Play, User } from "lucide-react";
import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import type { CustomField } from "@/lib/schema/enrichment-spec";
import { cn } from "@/lib/utils";
import { ReportModal } from "@/components/enrichment/report-modal";

type EnrichmentEvent =
  | { type: "start"; accounts: number; contacts: number }
  | {
      type: "account";
      id: string;
      status: "enriching" | "enriched" | "failed";
      error?: string;
    }
  | {
      type: "contact";
      id: string;
      status: "enriching" | "enriched" | "failed";
      error?: string;
    }
  | { type: "done" };

export type AccountRow = {
  id: string;
  company_name: string | null;
  company_linkedin: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_description: string | null;
  industry_iso: string | null;
  employee_count: number | null;
  hq_country: string | null;
  funding_stage: string | null;
  custom_data: Record<string, unknown>;
  enrichment_status: string;
};

export type ContactRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown>;
  enrichment_status: string;
  account_id: string | null;
};

type Props = {
  campaignId: string;
  campaignName: string;
  initialRunId?: string | null;
  accounts: AccountRow[];
  contacts: ContactRow[];
  accountCustomFields: CustomField[];
  contactCustomFields: CustomField[];
};

type Tab = "companies" | "people";

export function EnrichmentTables({
  campaignId,
  campaignName,
  initialRunId,
  accounts: initialAccounts,
  contacts: initialContacts,
  accountCustomFields,
  contactCustomFields,
}: Props) {
  const [tab, setTab] = useState<Tab>("companies");
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Live status overrides while workflow runs. The server data is the source
  // of truth; these overrides only apply during an active run.
  const [accountStatus, setAccountStatus] = useState<Record<string, string>>({});
  const [contactStatus, setContactStatus] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{
    accountsDone: number;
    contactsDone: number;
    total: number;
  } | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const accounts = useMemo(
    () =>
      initialAccounts.map((a) =>
        accountStatus[a.id]
          ? { ...a, enrichment_status: accountStatus[a.id]! }
          : a,
      ),
    [initialAccounts, accountStatus],
  );
  const contacts = useMemo(
    () =>
      initialContacts.map((c) =>
        contactStatus[c.id]
          ? { ...c, enrichment_status: contactStatus[c.id]! }
          : c,
      ),
    [initialContacts, contactStatus],
  );

  const consumeStream = useCallback(
    async (runId: string) => {
      const streamRes = await fetch(
        `/api/campaigns/${campaignId}/enrich?runId=${runId}`,
      );
      if (!streamRes.ok || !streamRes.body) {
        throw new Error(`stream failed (${streamRes.status})`);
      }

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accountsDone = 0;
      let contactsDone = 0;
      let total = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          buffer = buffer.slice(newlineIdx + 1);
          if (!line) continue;
          let event: EnrichmentEvent | null = null;
          try {
            event = JSON.parse(line) as EnrichmentEvent;
          } catch {
            continue;
          }
          if (!event) continue;
          if (event.type === "start") {
            total = event.accounts + event.contacts;
            setProgress({ accountsDone: 0, contactsDone: 0, total });
          } else if (event.type === "account") {
            setAccountStatus((prev) => ({ ...prev, [event.id]: event.status }));
            if (event.status === "enriched" || event.status === "failed") {
              accountsDone += 1;
              setProgress({ accountsDone, contactsDone, total });
            }
          } else if (event.type === "contact") {
            setContactStatus((prev) => ({ ...prev, [event.id]: event.status }));
            if (event.status === "enriched" || event.status === "failed") {
              contactsDone += 1;
              setProgress({ accountsDone, contactsDone, total });
            }
          } else if (event.type === "done") {
            // stream will close momentarily
          }
        }
      }

      startTransition(() => {
        router.refresh();
      });
    },
    [campaignId, router],
  );

  const startRun = useCallback(async () => {
    setRunError(null);
    setRunning(true);
    setProgress({ accountsDone: 0, contactsDone: 0, total: 0 });
    setAccountStatus({});
    setContactStatus({});

    try {
      const startRes = await fetch(`/api/campaigns/${campaignId}/enrich`, {
        method: "POST",
      });
      if (!startRes.ok) throw new Error(`start failed (${startRes.status})`);
      const { runId } = (await startRes.json()) as { runId: string };
      await consumeStream(runId);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Enrichment failed");
    } finally {
      setRunning(false);
    }
  }, [campaignId, consumeStream]);

  // Auto-subscribe on mount if a run was started by the server action and
  // there are still pending/enriching rows (i.e. the run is not yet done).
  const autoSubscribedRef = useRef(false);
  useEffect(() => {
    if (autoSubscribedRef.current) return;
    if (!initialRunId) return;
    const stillRunning =
      initialAccounts.some(
        (a) => a.enrichment_status === "pending" || a.enrichment_status === "enriching",
      ) ||
      initialContacts.some(
        (c) => c.enrichment_status === "pending" || c.enrichment_status === "enriching",
      );
    if (!stillRunning) return;
    autoSubscribedRef.current = true;

    (async () => {
      setRunError(null);
      setRunning(true);
      setProgress({ accountsDone: 0, contactsDone: 0, total: 0 });
      try {
        await consumeStream(initialRunId);
      } catch (err) {
        setRunError(err instanceof Error ? err.message : "Enrichment failed");
      } finally {
        setRunning(false);
      }
    })();
  }, [initialRunId, initialAccounts, initialContacts, consumeStream]);

  const canRun = !running && (initialAccounts.length > 0 || initialContacts.length > 0);

  const allRowsDone = useMemo(() => {
    const hasAny = accounts.length > 0 || contacts.length > 0;
    if (!hasAny) return false;
    const isDone = (s: string) => s === "enriched" || s === "failed";
    return (
      accounts.every((a) => isDone(a.enrichment_status)) &&
      contacts.every((c) => isDone(c.enrichment_status))
    );
  }, [accounts, contacts]);

  const canPreview = !running && allRowsDone;
  const canContinue = !running && !continuing && allRowsDone;

  const continueToEmails = useCallback(async () => {
    setContinuing(true);
    setRunError(null);
    try {
      // Fire the strategist workflow (idempotent-ish: produces a new run each
      // click). The emails page auto-subscribes to the latest run id.
      const res = await fetch(`/api/campaigns/${campaignId}/messaging`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`Failed to start strategist (${res.status})`);
      }
      router.push(`/campaigns/${campaignId}/emails`);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Could not continue");
      setContinuing(false);
    }
  }, [campaignId, router]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface/40 p-1 w-fit">
          <TabButton
            active={tab === "companies"}
            onClick={() => setTab("companies")}
            icon={<Building2 className="h-3.5 w-3.5" />}
            label="Companies"
            count={accounts.length}
          />
          <TabButton
            active={tab === "people"}
            onClick={() => setTab("people")}
            icon={<User className="h-3.5 w-3.5" />}
            label="People"
            count={contacts.length}
          />
        </div>

        <div className="flex items-center gap-3">
          {progress && progress.total > 0 && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {progress.accountsDone + progress.contactsDone} / {progress.total}
            </span>
          )}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            disabled={!canPreview}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
              canPreview
                ? "border-border bg-surface text-foreground hover:bg-surface/80"
                : "cursor-not-allowed border-border bg-surface text-muted-foreground opacity-60",
            )}
            title={
              canPreview
                ? "Preview the enrichment results"
                : "Preview available after enrichment finishes"
            }
          >
            <FileText className="h-3.5 w-3.5" />
            Preview enrichment results
          </button>
          <button
            type="button"
            onClick={startRun}
            disabled={!canRun}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
              canRun
                ? "border-accent/60 bg-accent text-background hover:bg-accent/90"
                : "cursor-not-allowed border-border bg-surface text-muted-foreground",
            )}
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {running
              ? "Enriching…"
              : initialRunId
                ? "Re-run enrichment"
                : "Run enrichment"}
          </button>
          <button
            type="button"
            onClick={continueToEmails}
            disabled={!canContinue}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] font-medium transition",
              canContinue
                ? "border-accent/60 bg-accent text-background hover:bg-accent/90"
                : "cursor-not-allowed border-border bg-surface text-muted-foreground opacity-60",
            )}
            title={
              canContinue
                ? "Start the marketing strategist and move to Phase 4"
                : "Available after enrichment finishes"
            }
          >
            {continuing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            {continuing ? "Starting…" : "Continue to emails"}
          </button>
        </div>
      </div>

      {runError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
          {runError}
        </div>
      )}

      {tab === "companies" ? (
        <DataTable
          rows={accounts}
          standard={STANDARD_ACCOUNT_FIELDS}
          custom={accountCustomFields}
          rowKey={(r) => r.id}
          emptyLabel="No companies yet. Corporate email domains will populate here; contacts on generic domains (gmail, hotmail, etc.) wait for enrichment to attach an employer."
        />
      ) : (
        <DataTable
          rows={contacts}
          standard={STANDARD_CONTACT_FIELDS}
          custom={contactCustomFields}
          rowKey={(r) => r.id}
          emptyLabel="No contacts imported yet."
        />
      )}

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        campaignId={campaignId}
        campaignName={campaignName}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-sm px-3 py-1.5 text-[12px] font-medium transition",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-sm px-1.5 py-px font-mono text-[10px]",
          active ? "bg-background/20" : "bg-surface",
        )}
      >
        {count}
      </span>
    </button>
  );
}

type TableProps<Row> = {
  rows: Row[];
  standard: readonly StandardField[];
  custom: CustomField[];
  rowKey: (row: Row) => string;
  emptyLabel: string;
};

function DataTable<Row extends { custom_data: Record<string, unknown>; enrichment_status: string }>({
  rows,
  standard,
  custom,
  rowKey,
  emptyLabel,
}: TableProps<Row>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/20 px-6 py-10 text-center">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-border bg-surface/40">
            <th className="sticky left-0 z-10 whitespace-nowrap bg-surface/40 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </th>
            {standard.map((f) => (
              <th
                key={f.key}
                className="whitespace-nowrap px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
              >
                {f.title}
              </th>
            ))}
            {custom.map((f) => (
              <th
                key={f.key}
                className="whitespace-nowrap border-l border-accent/20 bg-accent/5 px-3 py-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-accent"
              >
                {f.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-border last:border-0 hover:bg-surface/30"
            >
              <td className="sticky left-0 z-10 bg-background px-3 py-2">
                <StatusPill status={row.enrichment_status} />
              </td>
              {standard.map((f) => (
                <td key={f.key} className="px-3 py-2 text-foreground">
                  {formatCell((row as unknown as Record<string, unknown>)[f.key])}
                </td>
              ))}
              {custom.map((f) => (
                <td
                  key={f.key}
                  className="border-l border-accent/10 bg-accent/5 px-3 py-2 text-foreground"
                >
                  {formatCell(row.custom_data?.[f.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "border-border bg-surface text-muted-foreground",
    enriching: "border-accent/40 bg-accent/10 text-accent",
    enriched: "border-success/40 bg-success/10 text-success",
    failed: "border-destructive/40 bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
        map[status] ?? map.pending,
      )}
    >
      {status}
    </span>
  );
}

function formatCell(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
