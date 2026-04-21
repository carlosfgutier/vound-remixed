"use client";

import { Building2, Users } from "lucide-react";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";

type Props = {
  accounts: AccountLite[];
  contacts: ContactLite[];
  onSelect: (accountId: string) => void;
};

/**
 * Folder-card grid. Each card shows company name, employee count, a truncated
 * summary (if generated), and contact count. Clicking drills into detail.
 */
export function CompanyInsightsGrid({ accounts, contacts, onSelect }: Props) {
  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/20 px-6 py-10 text-center">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          No companies to show yet.
        </p>
      </div>
    );
  }

  const contactCountByAccount = new Map<string, number>();
  for (const c of contacts) {
    if (!c.account_id) continue;
    contactCountByAccount.set(
      c.account_id,
      (contactCountByAccount.get(c.account_id) ?? 0) + 1,
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {accounts.map((a) => {
        const contactCount = contactCountByAccount.get(a.id) ?? 0;
        const hasSummary = Boolean(a.summary);
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            className="group flex flex-col gap-3 rounded-lg border border-border bg-surface/30 px-4 py-4 text-left transition hover:border-accent/40 hover:bg-surface/60"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-[13px] font-medium text-foreground">
                  {a.company_name ?? "Unnamed company"}
                </span>
              </div>
              {hasSummary && (
                <span className="shrink-0 rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
                  insights
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {typeof a.employee_count === "number" && (
                <span>{a.employee_count.toLocaleString()} employees</span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {contactCount}
              </span>
            </div>

            <p className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground">
              {a.summary ??
                a.company_description ??
                "Click to generate insights for this company."}
            </p>
          </button>
        );
      })}
    </div>
  );
}
