"use client";

import { useState } from "react";
import { Table2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";
import { EnrichedTablesView } from "./enriched-tables-view";
import { CompanyInsightsGrid } from "./company-insights-grid";
import { CompanyInsightDetail } from "./company-insight-detail";

type EnrichedView = "tables" | "insights";

type Props = {
  campaignId: string;
  spec: EnrichmentSpec | null;
  accounts: AccountLite[];
  contacts: ContactLite[];
  initialView: EnrichedView;
  onViewChange: (view: EnrichedView) => void;
};

/**
 * Tab 2: sub-toggle between side-by-side enriched tables and per-company
 * insights (folder grid → drill-in detail). View state is URL-synced.
 */
export function EnrichmentTab({
  campaignId,
  spec,
  accounts,
  contacts,
  initialView,
  onViewChange,
}: Props) {
  const [view, setView] = useState<EnrichedView>(initialView);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    null,
  );

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId) ?? null
    : null;
  const selectedContacts = selectedAccountId
    ? contacts.filter((c) => c.account_id === selectedAccountId)
    : [];

  const setViewBoth = (next: EnrichedView) => {
    setView(next);
    onViewChange(next);
    // Exit any drill-in when switching views.
    if (next === "tables") setSelectedAccountId(null);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Sub-toggle */}
      <div className="flex items-center gap-1 w-fit rounded-md border border-border bg-surface/40 p-1">
        <SubTabButton
          active={view === "tables"}
          onClick={() => setViewBoth("tables")}
          icon={<Table2 className="h-3.5 w-3.5" />}
          label="Tables"
        />
        <SubTabButton
          active={view === "insights"}
          onClick={() => setViewBoth("insights")}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Company insights"
        />
      </div>

      {view === "tables" && (
        <EnrichedTablesView
          accounts={accounts}
          contacts={contacts}
          accountCustomFields={spec?.account.custom_fields ?? []}
          contactCustomFields={spec?.contact.custom_fields ?? []}
        />
      )}

      {view === "insights" && (
        <>
          {selectedAccount ? (
            <CompanyInsightDetail
              campaignId={campaignId}
              account={selectedAccount}
              contacts={selectedContacts}
              onBack={() => setSelectedAccountId(null)}
            />
          ) : (
            <CompanyInsightsGrid
              accounts={accounts}
              contacts={contacts}
              onSelect={(id) => setSelectedAccountId(id)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
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
    </button>
  );
}
