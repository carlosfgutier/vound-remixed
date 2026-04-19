"use client";

import { useState } from "react";
import { Building2, User } from "lucide-react";
import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import type { CustomField } from "@/lib/schema/enrichment-spec";
import { cn } from "@/lib/utils";

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
  accounts: AccountRow[];
  contacts: ContactRow[];
  accountCustomFields: CustomField[];
  contactCustomFields: CustomField[];
};

type Tab = "companies" | "people";

export function EnrichmentTables({
  accounts,
  contacts,
  accountCustomFields,
  contactCustomFields,
}: Props) {
  const [tab, setTab] = useState<Tab>("companies");

  return (
    <div className="flex flex-col gap-4">
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
