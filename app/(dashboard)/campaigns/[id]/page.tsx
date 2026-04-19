import { notFound } from "next/navigation";
import { EnrichmentSpecView } from "@/components/campaign-form/enrichment-spec-view";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";
import { rankedGoalSchema, type RankedGoal } from "@/lib/schema/campaign-input";
import { z } from "zod";

export const metadata = {
  title: "Enrichment spec · vBound",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function CampaignSpecPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, name, campaign_type, enrichment_spec, goals")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const spec = parseSpec(data.enrichment_spec);
  const goals = parseGoals(data.goals);
  if (!spec) notFound();

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-8 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {data.campaign_type}
        </div>
        <h1 className="mt-1 text-sm font-medium text-foreground">
          {data.name}
        </h1>
      </header>

      <div className="border-b border-border px-8 py-4">
        <div className="mx-auto w-full max-w-3xl">
          <PhaseTracker current="fields" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <EnrichmentSpecView spec={spec} goals={goals} campaignId={id} />
        </div>
      </div>
    </div>
  );
}

function parseSpec(raw: unknown): EnrichmentSpec | null {
  const result = enrichmentSpecSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function parseGoals(raw: unknown): RankedGoal[] {
  const result = z.array(rankedGoalSchema).safeParse(raw);
  return result.success ? result.data : [];
}
