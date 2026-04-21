"use client";

import { useMemo, useState } from "react";
import { Building2, User } from "lucide-react";
import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import {
  ENRICHMENT_SOURCE_LABEL,
  type CustomField,
} from "@/lib/schema/enrichment-spec";
import { cn } from "@/lib/utils";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";
import { CellPopover } from "./cell-popover";

type Props = {
  accounts: AccountLite[];
  contacts: ContactLite[];
  accountCustomFields: CustomField[];
  contactCustomFields: CustomField[];
};

type Tab = "companies" | "people";

/**
 * Read-only view of enrichment output. Companies | People tab switch, with a
 * CellPopover on double-click for inspecting raw values + provenance.
 */
export function EnrichedTablesView({
  accounts,
  contacts,
  accountCustomFields,
  contactCustomFields,
}: Props) {
  const [tab, setTab] = useState<Tab>("companies");
  const [popover, setPopover] = useState<PopoverState | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 w-fit rounded-md border border-border bg-surface/40 p-1">
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
          emptyLabel="No companies yet."
          onCellDoubleClick={(p) => setPopover(p)}
        />
      ) : (
        <DataTable
          rows={contacts}
          standard={STANDARD_CONTACT_FIELDS}
          custom={contactCustomFields}
          rowKey={(r) => r.id}
          emptyLabel="No contacts yet."
          onCellDoubleClick={(p) => setPopover(p)}
        />
      )}

      {popover && (
        <CellPopover
          anchor={{ x: popover.x, y: popover.y }}
          value={popover.value}
          fieldTitle={popover.fieldTitle}
          source={popover.source}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}

type PopoverState = {
  x: number;
  y: number;
  value: unknown;
  fieldTitle: string;
  source: string | null;
};

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
  onCellDoubleClick: (p: PopoverState) => void;
};

function DataTable<
  Row extends {
    custom_data: Record<string, unknown> | null;
    enrichment_status: string;
  },
>({
  rows,
  standard,
  custom,
  rowKey,
  emptyLabel,
  onCellDoubleClick,
}: TableProps<Row>) {
  const customByKey = useMemo(
    () => new Map(custom.map((f) => [f.key, f])),
    [custom],
  );

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
              {standard.map((f) => {
                const raw = (row as unknown as Record<string, unknown>)[f.key];
                return (
                  <td
                    key={f.key}
                    onDoubleClick={(e) => {
                      if (isEmpty(raw)) return;
                      onCellDoubleClick({
                        x: e.clientX,
                        y: e.clientY,
                        value: raw,
                        fieldTitle: f.title,
                        source: "Standard field",
                      });
                    }}
                    className="px-3 py-2 text-foreground"
                  >
                    {formatCell(raw)}
                  </td>
                );
              })}
              {custom.map((f) => {
                const raw = row.custom_data?.[f.key];
                const cf = customByKey.get(f.key);
                const source = cf
                  ? formatCustomSource(cf)
                  : "Custom field";
                return (
                  <td
                    key={f.key}
                    onDoubleClick={(e) => {
                      if (isEmpty(raw)) return;
                      onCellDoubleClick({
                        x: e.clientX,
                        y: e.clientY,
                        value: raw,
                        fieldTitle: f.title,
                        source,
                      });
                    }}
                    className="border-l border-accent/10 bg-accent/5 px-3 py-2 text-foreground"
                  >
                    {formatCell(raw)}
                  </td>
                );
              })}
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

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function formatCell(value: unknown): React.ReactNode {
  if (isEmpty(value)) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return value.toLocaleString();
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") {
    const s = JSON.stringify(value);
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }
  const str = String(value);
  return str.length > 60 ? str.slice(0, 57) + "…" : str;
}

function formatCustomSource(f: CustomField): string {
  const primary = ENRICHMENT_SOURCE_LABEL[f.enrichment.primary_source];
  if (!f.enrichment.fallback_source) return primary;
  const fallback = ENRICHMENT_SOURCE_LABEL[f.enrichment.fallback_source];
  return `${primary} → ${fallback}`;
}
