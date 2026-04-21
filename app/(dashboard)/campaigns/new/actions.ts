"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { campaignInputSchema } from "@/lib/schema/campaign-input";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";
import { generateEnrichmentSpec } from "@/lib/ai/generate-enrichment-spec";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { companyDomainFromEmail } from "@/lib/email-domains";
import { enrichCampaignWorkflow } from "@/workflows/enrich-campaign";

export type DefineEnrichmentResult = { ok: false; error: string };

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

const COMPANY_NAME_COLUMNS = ["company_name", "company", "organization", "account"];

function deriveCampaignName(campaignType: string): string {
  const oneLine = campaignType.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 80) return oneLine;
  return oneLine.slice(0, 77).trimEnd() + "…";
}

function pickCompanyName(record: Record<string, string>): string | null {
  for (const col of COMPANY_NAME_COLUMNS) {
    const val = record[col];
    if (val && val.trim()) return val.trim();
  }
  return null;
}

function pickCompanyLinkedIn(record: Record<string, string>): string | null {
  const val = record.company_linkedin ?? record.company_linkedin_url;
  return val && val.trim() ? val.trim() : null;
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
      providers: input.providers ?? [],
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

  // Group records by corporate domain so we can stub one account per domain.
  // Generic mailbox domains (gmail, etc) do not produce a stub — enrichment
  // may attach a real employer later.
  const domainToSeed = new Map<
    string,
    { name: string | null; linkedin: string | null }
  >();
  for (const record of input.contacts.records) {
    const domain = companyDomainFromEmail(record.email);
    if (!domain) continue;
    const existing = domainToSeed.get(domain);
    const name = pickCompanyName(record);
    const linkedin = pickCompanyLinkedIn(record);
    if (!existing) {
      domainToSeed.set(domain, { name, linkedin });
    } else {
      if (!existing.name && name) existing.name = name;
      if (!existing.linkedin && linkedin) existing.linkedin = linkedin;
    }
  }

  const domainToAccountId = new Map<string, string>();

  if (domainToSeed.size > 0) {
    const accountRows = Array.from(domainToSeed.entries()).map(([domain, seed]) => ({
      campaign_id: campaignId,
      company_domain: domain,
      company_name: seed.name,
      company_linkedin: seed.linkedin,
    }));

    const { data: insertedAccounts, error: accountsError } = await supabase
      .from("accounts")
      .insert(accountRows)
      .select("id, company_domain");

    if (accountsError || !insertedAccounts) {
      return {
        ok: false,
        error: accountsError?.message ?? "Failed to save accounts.",
      };
    }

    for (const row of insertedAccounts) {
      if (row.company_domain) {
        domainToAccountId.set(row.company_domain as string, row.id as string);
      }
    }
  }

  const contactRows = input.contacts.records.map((record) => {
    const raw_import: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!STANDARD_CONTACT_COLUMNS.has(key)) raw_import[key] = value;
    }
    const domain = companyDomainFromEmail(record.email);
    const account_id = domain ? domainToAccountId.get(domain) ?? null : null;
    return {
      campaign_id: campaignId,
      account_id,
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

  // Kick off enrichment in the background and record the runId so Phase 3
  // can subscribe to the stream on mount. If this fails we still navigate
  // to Phase 3 — the user can retry from there.
  try {
    const run = await start(enrichCampaignWorkflow, [campaignId]);
    await supabase
      .from("campaigns")
      .update({ enrichment_run_id: run.runId })
      .eq("id", campaignId);
  } catch (err) {
    console.error("[defineEnrichmentAction] failed to start workflow", err);
  }

  revalidatePath("/", "layout");
  redirect(`/campaigns/${campaignId}/loading`);
}
