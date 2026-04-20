import { FatalError, RetryableError, getWritable } from "workflow";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateEmailStrategy } from "@/lib/ai/generate-email-strategy";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";
import { rankedGoalSchema, type RankedGoal } from "@/lib/schema/campaign-input";
import { CAMPAIGN_GOALS } from "@/lib/campaign-goals";
import type { EmailStrategy } from "@/lib/schema/email-strategy";

export type StrategyEvent =
  | { type: "start" }
  | { type: "thinking"; note: string }
  | { type: "done"; framework: EmailStrategy["framework"]; steps: number }
  | { type: "error"; message: string };

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("rate-limited")) return true;
  if (msg.includes("free credits temporarily")) return true;
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (statusCode === 429) return true;
  return false;
}

async function emit(event: StrategyEvent) {
  "use step";
  console.log("[strategy] emit", event);
  const writer = getWritable<StrategyEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

type LoadedCampaign = {
  campaignName: string;
  campaignType: string;
  audience: string;
  goals: Array<{ id: string; label: string }>;
  spec: EnrichmentSpec;
  sampleAccounts: Array<Record<string, unknown>>;
  sampleContacts: Array<Record<string, unknown>>;
};

async function loadCampaign(campaignId: string): Promise<LoadedCampaign> {
  "use step";
  console.log("[strategy] loadCampaign:start", { campaignId });
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("id, name, campaign_type, audience, goals, enrichment_spec")
    .eq("id", campaignId)
    .maybeSingle();

  if (cErr || !campaign) {
    throw new FatalError(`Campaign ${campaignId} not found`);
  }

  const parsedSpec = enrichmentSpecSchema.safeParse(campaign.enrichment_spec);
  if (!parsedSpec.success) {
    throw new FatalError("Campaign has no valid enrichment spec");
  }

  const parsedGoals = z.array(rankedGoalSchema).safeParse(campaign.goals);
  const rankedGoals: RankedGoal[] = parsedGoals.success ? parsedGoals.data : [];
  const goals = rankedGoals.map((g) => {
    const base = CAMPAIGN_GOALS.find((cg) => cg.id === g.id);
    const label = g.id === "other" ? g.customLabel ?? "Other" : base?.label ?? g.id;
    return { id: g.id, label };
  });

  const { data: accountRows, error: aErr } = await supabase
    .from("accounts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("enrichment_status", "enriched")
    .limit(8);
  if (aErr) throw new FatalError(aErr.message);

  const { data: contactRows, error: ctErr } = await supabase
    .from("contacts")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("enrichment_status", "enriched")
    .limit(10);
  if (ctErr) throw new FatalError(ctErr.message);

  const cleanAccount = (row: Record<string, unknown>) => {
    const {
      provenance: _p,
      enrichment_error: _ee,
      created_at: _ca,
      updated_at: _ua,
      campaign_id: _cid,
      ...rest
    } = row;
    return rest;
  };
  const cleanContact = (row: Record<string, unknown>) => {
    const {
      provenance: _p,
      enrichment_error: _ee,
      created_at: _ca,
      updated_at: _ua,
      campaign_id: _cid,
      raw_import: _ri,
      email_overrides: _eo,
      ...rest
    } = row;
    return rest;
  };

  return {
    campaignName: (campaign.name as string) ?? "Untitled campaign",
    campaignType: (campaign.campaign_type as string) ?? "",
    audience: (campaign.audience as string) ?? "",
    goals,
    spec: parsedSpec.data,
    sampleAccounts: (accountRows ?? []).map(cleanAccount),
    sampleContacts: (contactRows ?? []).map(cleanContact),
  };
}

async function runStrategist(
  campaignId: string,
  loaded: LoadedCampaign,
): Promise<EmailStrategy> {
  "use step";
  console.log("[strategy] runStrategist:start", { campaignId });
  try {
    const strategy = await generateEmailStrategy(loaded);
    console.log("[strategy] runStrategist:produced", {
      framework: strategy.framework,
      steps: strategy.sequence.length,
    });
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("campaigns")
      .update({ email_strategy: strategy })
      .eq("id", campaignId);
    if (error) throw new Error(error.message);
    return strategy;
  } catch (err) {
    if (isRateLimitError(err)) {
      throw new RetryableError("AI Gateway rate limited", { retryAfter: "30s" });
    }
    const message = err instanceof Error ? err.message : "Strategist failed";
    throw new FatalError(message);
  }
}

export async function generateEmailStrategyWorkflow(campaignId: string) {
  "use workflow";
  console.log("[strategy] workflow:start", { campaignId });

  await emit({ type: "start" });
  await emit({ type: "thinking", note: "Reviewing enriched sample and goals." });

  const loaded = await loadCampaign(campaignId);

  await emit({
    type: "thinking",
    note: `Designing sequence for ${loaded.sampleContacts.length} sampled contacts.`,
  });

  const strategy = await runStrategist(campaignId, loaded);

  await emit({
    type: "done",
    framework: strategy.framework,
    steps: strategy.sequence.length,
  });

  return { campaignId, framework: strategy.framework };
}
