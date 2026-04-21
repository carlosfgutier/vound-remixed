import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateCompanySummary } from "@/lib/enrichment/generate-company-summary";

/**
 * Lazy per-company insight generator. Called on first click into a company's
 * detail view; persists summary/angle/insights to the accounts row so repeat
 * visits are instant. POST with no body.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> },
) {
  const { id: campaignId, accountId } = await params;
  const supabase = getSupabaseAdmin();

  // Load the account + its parent campaign brief in parallel.
  const [accountResult, campaignResult] = await Promise.all([
    supabase
      .from("accounts")
      .select(
        "id, campaign_id, company_name, company_domain, company_website, company_description, industry_iso, employee_count, hq_country, funding_stage, custom_data",
      )
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("campaigns")
      .select("id, campaign_type, audience, goals")
      .eq("id", campaignId)
      .maybeSingle(),
  ]);

  const { data: account, error: accountError } = accountResult;
  const { data: campaign, error: campaignError } = campaignResult;

  if (accountError || !account) {
    return NextResponse.json(
      { error: accountError?.message ?? "account not found" },
      { status: 404 },
    );
  }
  if (account.campaign_id !== campaignId) {
    return NextResponse.json(
      { error: "account does not belong to this campaign" },
      { status: 400 },
    );
  }
  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: campaignError?.message ?? "campaign not found" },
      { status: 404 },
    );
  }

  // Generate (fresh each POST — callers decide whether to re-generate).
  const output = await generateCompanySummary(
    {
      company_name: account.company_name as string | null,
      company_domain: account.company_domain as string | null,
      company_website: account.company_website as string | null,
      company_description: account.company_description as string | null,
      industry_iso: account.industry_iso as string | null,
      employee_count: account.employee_count as number | null,
      hq_country: account.hq_country as string | null,
      funding_stage: account.funding_stage as string | null,
      custom_data: (account.custom_data as Record<string, unknown> | null) ?? null,
    },
    {
      campaign_type: campaign.campaign_type as string | null,
      audience: campaign.audience as string | null,
      goals: campaign.goals,
    },
  );

  const summary_generated_at = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("accounts")
    .update({
      summary: output.summary,
      angle: output.angle,
      insights: output.insights,
      summary_generated_at,
    })
    .eq("id", accountId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    summary: output.summary,
    angle: output.angle,
    insights: output.insights,
    summary_generated_at,
  });
}
