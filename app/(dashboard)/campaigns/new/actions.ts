"use server";

import { campaignInputSchema, type CampaignInput } from "@/lib/schema/campaign-input";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";
import { generateEnrichmentSpec } from "@/lib/ai/generate-enrichment-spec";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type DefineEnrichmentResult =
  | { ok: true; spec: EnrichmentSpec; input: CampaignInput; campaignId: string }
  | { ok: false; error: string };

const STANDARD_CONTACT_COLUMNS = new Set([
  "email",
  "first_name",
  "last_name",
  "contact_linkedin",
  "job_title",
  "seniority",
  "department",
  "contact_country",
]);

function deriveCampaignName(campaignType: string): string {
  const oneLine = campaignType.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77).trimEnd() + "…";
}

export async function defineEnrichmentAction(
  raw: unknown,
): Promise<DefineEnrichmentResult> {
  const parsed = campaignInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid campaign input." };
  }

  const input = parsed.data;

  let spec: EnrichmentSpec;
  try {
    spec = await generateEnrichmentSpec(input);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to generate enrichment spec.";
    return { ok: false, error: message };
  }

  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .insert({
      name: deriveCampaignName(input.campaignType),
      campaign_type: input.campaignType,
      audience: input.audience,
      goals: input.goals,
      enrichment_spec: spec,
      status: "defining",
    })
    .select("id")
    .single();

  if (campaignError || !campaign) {
    return {
      ok: false,
      error: campaignError?.message ?? "Failed to save campaign.",
    };
  }

  const campaignId = campaign.id as string;

  const contactRows = input.contacts.records.map((record) => {
    const raw_import: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!STANDARD_CONTACT_COLUMNS.has(key)) raw_import[key] = value;
    }
    return {
      campaign_id: campaignId,
      email: record.email.toLowerCase().trim(),
      first_name: record.first_name || null,
      last_name: record.last_name || null,
      contact_linkedin: record.contact_linkedin || null,
      job_title: record.job_title || null,
      seniority: record.seniority || null,
      department: record.department || null,
      contact_country: record.contact_country || null,
      raw_import,
    };
  });

  const { error: contactsError } = await supabase
    .from("contacts")
    .insert(contactRows);

  if (contactsError) {
    return { ok: false, error: contactsError.message };
  }

  return { ok: true, spec, input, campaignId };
}
