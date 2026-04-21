"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { EmailStrategy } from "@/lib/schema/email-strategy";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";
import type {
  AccountLite,
  ContactLite,
} from "@/app/(dashboard)/campaigns/[id]/preview/page";
import { FieldSchemaTab } from "./field-schema-tab";
import { EnrichmentTab } from "./enrichment-tab";
import { EmailsTab } from "./emails-tab";

type PreviewTab = "fields" | "enriched" | "emails";
type EnrichedView = "tables" | "insights";

type Props = {
  campaignId: string;
  campaignName: string;
  strategy: EmailStrategy;
  spec: EnrichmentSpec | null;
  strategyRunId: string | null;
  accounts: AccountLite[];
  contacts: ContactLite[];
  initialTab: PreviewTab;
  initialEnrichedView: EnrichedView;
  initialStepIdx: number | null;
};

const TABS: Array<{ id: PreviewTab; label: string; description: string }> = [
  {
    id: "fields",
    label: "Field Schema",
    description: "What we researched and why.",
  },
  {
    id: "enriched",
    label: "Enrichment Tables",
    description: "Rows, cells, and per-company insights.",
  },
  {
    id: "emails",
    label: "Emails",
    description: "Framework, templates, and launch.",
  },
];

export function CampaignPreview({
  campaignId,
  campaignName,
  strategy,
  spec,
  strategyRunId,
  accounts,
  contacts,
  initialTab,
  initialEnrichedView,
  initialStepIdx,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<PreviewTab>(initialTab);

  // URL-sync helper. Replaces the URL without scrolling/jumping.
  const updateUrl = useCallback(
    (next: Partial<{ tab: PreviewTab; view: EnrichedView | null; step: number | null }>) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (next.tab !== undefined) sp.set("tab", next.tab);
      if (next.view !== undefined) {
        if (next.view === null) sp.delete("view");
        else sp.set("view", next.view);
      }
      if (next.step !== undefined) {
        if (next.step === null) sp.delete("step");
        else sp.set("step", String(next.step + 1)); // 1-indexed in URL
      }
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const onTabChange = useCallback(
    (next: PreviewTab) => {
      setTab(next);
      // Clear sub-toggles that don't apply to the new tab.
      updateUrl({
        tab: next,
        view: next === "enriched" ? undefined : null,
        step: next === "emails" ? undefined : null,
      });
    },
    [updateUrl],
  );

  const activeTab = useMemo(() => TABS.find((t) => t.id === tab)!, [tab]);

  return (
    <div className="flex h-full w-full flex-col">
      {/* Tab bar */}
      <div className="border-b border-border bg-background/40 px-8 pt-4">
        <div className="mx-auto w-full max-w-6xl">
          <div className="flex items-end gap-6">
            {TABS.map((t) => {
              const isActive = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={cn(
                    "relative -mb-px border-b-2 pb-3 pt-1 text-[13px] font-medium transition-colors outline-none",
                    isActive
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 pb-3 text-[12px] leading-relaxed text-muted-foreground">
            {activeTab.description}
          </p>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 px-8 py-8">
        <div className="mx-auto w-full max-w-6xl">
          {tab === "fields" && (
            <FieldSchemaTab spec={spec} />
          )}
          {tab === "enriched" && (
            <EnrichmentTab
              campaignId={campaignId}
              spec={spec}
              accounts={accounts}
              contacts={contacts}
              initialView={initialEnrichedView}
              onViewChange={(view) => updateUrl({ view })}
            />
          )}
          {tab === "emails" && (
            <EmailsTab
              campaignId={campaignId}
              campaignName={campaignName}
              initialStrategy={strategy}
              initialRunId={strategyRunId}
              accounts={accounts}
              contacts={contacts}
              initialStepIdx={initialStepIdx}
              onStepChange={(idx) => updateUrl({ step: idx })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
