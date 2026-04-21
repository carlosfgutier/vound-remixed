import { notFound, redirect } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { LoadingScreen } from "@/components/loading/loading-screen";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const metadata = {
  title: "Working… · vound",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function LoadingPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdmin();
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select(
      "id, name, campaign_type, enrichment_run_id, strategy_run_id, email_strategy",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !campaign) notFound();

  // If the strategy is already populated, skip the loading screen entirely.
  if (campaign.email_strategy) {
    redirect(`/campaigns/${id}/preview?tab=fields`);
  }

  return (
    <div className="flex h-full w-full flex-col">
      <header className="border-b border-border px-8 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {campaign.campaign_type}
        </div>
        <h1 className="mt-1 text-sm font-medium text-foreground">
          {campaign.name}
        </h1>
      </header>

      <div className="border-b border-border px-8 py-4">
        <div className="mx-auto w-full max-w-6xl">
          <PhaseTracker current="loading" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <LoadingScreen
          campaignId={id}
          initialEnrichmentRunId={campaign.enrichment_run_id ?? null}
          initialStrategyRunId={campaign.strategy_run_id ?? null}
        />
      </div>
    </div>
  );
}
