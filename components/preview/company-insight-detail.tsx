"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Building2, Loader2, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";

type Props = {
  campaignId: string;
  account: AccountLite;
  contacts: ContactLite[];
  onBack: () => void;
};

type InsightsResponse = {
  summary: string;
  angle: string;
  insights: string[] | null;
  summary_generated_at: string;
};

/**
 * Company insight drill-in. On mount, if the account has no persisted summary,
 * we fire a POST to the summary endpoint which lazy-generates + persists.
 */
export function CompanyInsightDetail({
  campaignId,
  account,
  contacts,
  onBack,
}: Props) {
  const [summary, setSummary] = useState<string | null>(account.summary);
  const [angle, setAngle] = useState<string | null>(account.angle);
  const [insights, setInsights] = useState<string[] | null>(
    parseInsights(account.insights),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/accounts/${account.id}/summary`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed (${res.status})`);
      }
      const data = (await res.json()) as InsightsResponse;
      setSummary(data.summary);
      setAngle(data.angle);
      setInsights(data.insights);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate insights");
    } finally {
      setLoading(false);
    }
  }, [account.id, campaignId]);

  // Lazy generate on first view.
  useEffect(() => {
    if (!summary && !loading && !error) {
      void generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-sm text-[12px] font-medium text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to companies
        </button>
        {summary && !loading && (
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-surface/80 hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            Regenerate
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface/40">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {account.company_name ?? "Unnamed company"}
          </h3>
          <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            {typeof account.employee_count === "number" && (
              <span>{account.employee_count.toLocaleString()} employees</span>
            )}
            {account.hq_country && <span>{account.hq_country}</span>}
            {account.funding_stage && <span>{account.funding_stage}</span>}
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface/30 px-4 py-3 text-[12px] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Generating insights…
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[12px] text-destructive">
          <span>{error}</span>
          <button
            type="button"
            onClick={generate}
            className="rounded-sm px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      )}

      {summary && (
        <section>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Summary
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-foreground">
            {summary}
          </p>
        </section>
      )}

      {angle && (
        <section>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Angle
          </div>
          <p className="mt-2 rounded-md border border-accent/30 bg-accent/5 px-3 py-3 text-[13px] leading-relaxed text-foreground">
            {angle}
          </p>
        </section>
      )}

      {insights && insights.length > 0 && (
        <section>
          <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Key signals
          </div>
          <ul className="mt-2 space-y-1.5">
            {insights.map((signal, i) => (
              <li
                key={i}
                className="flex gap-2 text-[12px] leading-relaxed text-foreground"
              >
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                {signal}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <Users className="h-3 w-3" />
          People ({contacts.length})
        </div>
        {contacts.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            No contacts attached.
          </p>
        ) : (
          <ul className="divide-y divide-border/60 rounded-md border border-border bg-surface/20">
            {contacts.map((c) => (
              <li key={c.id} className="px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-foreground">
                      {[c.first_name, c.last_name].filter(Boolean).join(" ") ||
                        c.email}
                    </div>
                    <div className="truncate text-muted-foreground">
                      {c.job_title ?? "—"}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]",
                      c.enrichment_status === "enriched"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {c.enrichment_status}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function parseInsights(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    const strs = raw.filter((x): x is string => typeof x === "string");
    return strs.length > 0 ? strs : null;
  }
  return null;
}
