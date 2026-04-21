import { notFound, redirect } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { CampaignPreview } from "@/components/preview/campaign-preview";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";

export const metadata = {
  title: "Preview · vound",
};

type PreviewTab = "fields" | "enriched" | "emails";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    tab?: string;
    view?: string;
    step?: string;
  }>;
};

export default async function PreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  const supabase = getSupabaseAdmin();

  const [{ data: campaign, error: campaignError }, accountsResult, contactsResult] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, campaign_type, enrichment_spec, email_strategy, strategy_run_id",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select(
          "id, company_name, company_linkedin, company_domain, company_website, company_description, industry_iso, employee_count, hq_country, funding_stage, custom_data, enrichment_status, summary, angle, insights, summary_generated_at",
        )
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("contacts")
        .select(
          "id, account_id, email, first_name, last_name, contact_linkedin, job_title, seniority, department, contact_country, custom_data, enrichment_status",
        )
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (campaignError || !campaign) notFound();

  const strategy = parseStrategy(campaign.email_strategy);

  // Guard: if strategy hasn't landed yet, route back to the loading screen.
  if (!strategy) {
    redirect(`/campaigns/${id}/loading`);
  }

  const spec = parseSpec(campaign.enrichment_spec);

  const initialTab = normalizeTab(sp.tab);
  const initialEnrichedView = sp.view === "insights" ? "insights" : "tables";
  const initialStepIdx = parseStepIdx(sp.step);

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
          <PhaseTracker current="preview" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <CampaignPreview
          campaignId={id}
          campaignName={campaign.name as string}
          strategy={strategy}
          spec={spec}
          strategyRunId={(campaign.strategy_run_id as string | null) ?? null}
          accounts={(accountsResult.data ?? []) as AccountLite[]}
          contacts={(contactsResult.data ?? []) as ContactLite[]}
          initialTab={initialTab}
          initialEnrichedView={initialEnrichedView}
          initialStepIdx={initialStepIdx}
        />
      </div>
    </div>
  );
}

function parseStrategy(raw: unknown): EmailStrategy | null {
  if (!raw) return null;
  const result = emailStrategySchema.safeParse(raw);
  return result.success ? result.data : null;
}

function parseSpec(raw: unknown): EnrichmentSpec | null {
  if (!raw) return null;
  const result = enrichmentSpecSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function normalizeTab(raw: string | undefined): PreviewTab {
  if (raw === "enriched" || raw === "emails") return raw;
  return "fields";
}

function parseStepIdx(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n - 1; // URL is 1-indexed, internal is 0-indexed
}

export type AccountLite = {
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
  custom_data: Record<string, unknown> | null;
  enrichment_status: string;
  summary: string | null;
  angle: string | null;
  insights: unknown;
  summary_generated_at: string | null;
};

export type ContactLite = {
  id: string;
  account_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown> | null;
  enrichment_status: string;
};
