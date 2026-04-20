import { FatalError, RetryableError, getWritable } from "workflow";
import { start } from "workflow/api";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  aiEnrichAccount,
  aiEnrichContact,
} from "@/lib/enrichment/ai-enrichment";
import {
  providerLookupAccount,
  providerLookupContact,
} from "@/lib/enrichment/mock-provider";
import {
  reconcileAccount,
  reconcileContact,
} from "@/lib/enrichment/reconcile";
import { generateEmailStrategyWorkflow } from "@/workflows/generate-email-strategy";

export type EnrichmentEvent =
  | { type: "start"; accounts: number; contacts: number }
  | { type: "account"; id: string; status: "enriching" | "enriched" | "failed"; error?: string }
  | { type: "contact"; id: string; status: "enriching" | "enriched" | "failed"; error?: string }
  | { type: "done" };

type AccountInput = {
  id: string;
  company_name: string | null;
  company_domain: string | null;
  company_linkedin: string | null;
};

type ContactInput = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  account_id: string | null;
};

type LoadedData = {
  spec: EnrichmentSpec;
  accounts: AccountInput[];
  contacts: ContactInput[];
};

async function emit(event: EnrichmentEvent) {
  "use step";
  console.log("[enrich] emit", event);
  const writer = getWritable<EnrichmentEvent>().getWriter();
  try {
    await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

const CONCURRENCY = 3;

async function runBatched<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (msg.includes("rate limit") || msg.includes("rate-limited")) return true;
  if (msg.includes("free credits temporarily")) return true;
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (statusCode === 429) return true;
  return false;
}

async function loadCampaignData(campaignId: string): Promise<LoadedData> {
  "use step";
  console.log("[enrich] loadCampaignData:start", { campaignId });
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, enrichment_spec, status")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new FatalError(`Campaign ${campaignId} not found`);
  }

  const parsedSpec = enrichmentSpecSchema.safeParse(campaign.enrichment_spec);
  if (!parsedSpec.success) {
    throw new FatalError("Campaign has no valid enrichment spec");
  }

  const { data: accountRows, error: accountsError } = await supabase
    .from("accounts")
    .select("id, company_name, company_domain, company_linkedin")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (accountsError) throw new FatalError(accountsError.message);

  const { data: contactRows, error: contactsError } = await supabase
    .from("contacts")
    .select(
      "id, email, first_name, last_name, contact_linkedin, job_title, account_id",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (contactsError) throw new FatalError(contactsError.message);

  // Flip campaign status to enriching.
  await supabase
    .from("campaigns")
    .update({ status: "enriching" })
    .eq("id", campaignId);

  return {
    spec: parsedSpec.data,
    accounts: (accountRows ?? []) as AccountInput[],
    contacts: (contactRows ?? []) as ContactInput[],
  };
}

async function markStatus(
  table: "accounts" | "contacts",
  id: string,
  status: "enriching" | "enriched" | "failed",
  error: string | null = null,
) {
  "use step";
  const supabase = getSupabaseAdmin();
  await supabase
    .from(table)
    .update({
      enrichment_status: status,
      enrichment_error: error,
    })
    .eq("id", id);
}

async function enrichAccountStep(
  accountId: string,
  known: {
    company_name: string | null;
    company_domain: string | null;
    company_linkedin: string | null;
  },
  spec: EnrichmentSpec,
): Promise<{ id: string; ok: boolean; error?: string }> {
  "use step";
  console.log("[enrich] enrichAccountStep:start", { accountId });
  const supabase = getSupabaseAdmin();

  let ai, provider;
  try {
    [ai, provider] = await Promise.all([
      aiEnrichAccount(known, spec),
      Promise.resolve(
        providerLookupAccount(known.company_domain, spec.account.custom_fields),
      ),
    ]);
  } catch (err) {
    if (isRateLimitError(err)) {
      console.warn("[enrich] account rate limited, will retry", { accountId });
      throw new RetryableError("AI Gateway rate limited", { retryAfter: "30s" });
    }
    const message = err instanceof Error ? err.message : "Account enrichment failed";
    await supabase
      .from("accounts")
      .update({ enrichment_status: "failed", enrichment_error: message })
      .eq("id", accountId);
    return { id: accountId, ok: false, error: message };
  }

  try {
    const reconciled = reconcileAccount(ai, provider, spec.account.custom_fields);

    const { error } = await supabase
      .from("accounts")
      .update({
        company_name: reconciled.company_name,
        company_linkedin: reconciled.company_linkedin,
        company_domain: reconciled.company_domain,
        company_website: reconciled.company_website,
        company_description: reconciled.company_description,
        industry_iso: reconciled.industry_iso,
        employee_count: reconciled.employee_count,
        hq_country: reconciled.hq_country,
        funding_stage: reconciled.funding_stage,
        custom_data: reconciled.custom_data,
        provenance: reconciled.provenance,
        enrichment_status: "enriched",
        enrichment_error: null,
      })
      .eq("id", accountId);

    if (error) throw new Error(error.message);
    return { id: accountId, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Account enrichment failed";
    await supabase
      .from("accounts")
      .update({ enrichment_status: "failed", enrichment_error: message })
      .eq("id", accountId);
    return { id: accountId, ok: false, error: message };
  }
}

async function enrichContactStep(
  contactId: string,
  known: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    contact_linkedin: string | null;
    job_title: string | null;
    company_name: string | null;
    company_domain: string | null;
  },
  spec: EnrichmentSpec,
): Promise<{ id: string; ok: boolean; error?: string }> {
  "use step";
  console.log("[enrich] enrichContactStep:start", { contactId });
  const supabase = getSupabaseAdmin();

  let ai, provider;
  try {
    [ai, provider] = await Promise.all([
      aiEnrichContact(known, spec),
      Promise.resolve(
        providerLookupContact(
          known.email,
          {
            first_name: known.first_name,
            last_name: known.last_name,
            contact_linkedin: known.contact_linkedin,
            job_title: known.job_title,
          },
          spec.contact.custom_fields,
        ),
      ),
    ]);
  } catch (err) {
    if (isRateLimitError(err)) {
      console.warn("[enrich] contact rate limited, will retry", { contactId });
      throw new RetryableError("AI Gateway rate limited", { retryAfter: "30s" });
    }
    const message = err instanceof Error ? err.message : "Contact enrichment failed";
    await supabase
      .from("contacts")
      .update({ enrichment_status: "failed", enrichment_error: message })
      .eq("id", contactId);
    return { id: contactId, ok: false, error: message };
  }

  try {
    const reconciled = reconcileContact(ai, provider, spec.contact.custom_fields);

    const { error } = await supabase
      .from("contacts")
      .update({
        first_name: reconciled.first_name,
        last_name: reconciled.last_name,
        contact_linkedin: reconciled.contact_linkedin,
        job_title: reconciled.job_title,
        seniority: reconciled.seniority,
        department: reconciled.department,
        contact_country: reconciled.contact_country,
        custom_data: reconciled.custom_data,
        provenance: reconciled.provenance,
        enrichment_status: "enriched",
        enrichment_error: null,
      })
      .eq("id", contactId);

    if (error) throw new Error(error.message);
    return { id: contactId, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Contact enrichment failed";
    await supabase
      .from("contacts")
      .update({ enrichment_status: "failed", enrichment_error: message })
      .eq("id", contactId);
    return { id: contactId, ok: false, error: message };
  }
}

async function fetchAccountContextMap(
  campaignId: string,
): Promise<Map<string, { company_name: string | null; company_domain: string | null }>> {
  "use step";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, company_name, company_domain")
    .eq("campaign_id", campaignId);
  if (error) throw new FatalError(error.message);
  const map = new Map<string, { company_name: string | null; company_domain: string | null }>();
  for (const row of data ?? []) {
    map.set(row.id as string, {
      company_name: (row.company_name as string | null) ?? null,
      company_domain: (row.company_domain as string | null) ?? null,
    });
  }
  return map;
}

async function finalizeCampaign(campaignId: string) {
  "use step";
  console.log("[enrich] finalizeCampaign", { campaignId });
  const supabase = getSupabaseAdmin();
  await supabase.from("campaigns").update({ status: "ready" }).eq("id", campaignId);
}

/**
 * Fire-and-forget kick-off for Phase 4 (marketing strategist).
 * Wrapped in a step so `start()` runs outside the workflow sandbox.
 * We persist the run id so the Phase 4 page can auto-subscribe on mount.
 */
async function kickOffStrategy(campaignId: string): Promise<string | null> {
  "use step";
  console.log("[enrich] kickOffStrategy:start", { campaignId });
  try {
    const run = await start(generateEmailStrategyWorkflow, [campaignId]);
    const supabase = getSupabaseAdmin();
    await supabase
      .from("campaigns")
      .update({ strategy_run_id: run.runId })
      .eq("id", campaignId);
    return run.runId;
  } catch (err) {
    console.error("[enrich] kickOffStrategy failed", err);
    return null;
  }
}

export async function enrichCampaignWorkflow(campaignId: string) {
  "use workflow";

  const { spec, accounts, contacts } = await loadCampaignData(campaignId);

  await emit({ type: "start", accounts: accounts.length, contacts: contacts.length });

  // Enrich accounts with bounded concurrency.
  await runBatched(accounts, CONCURRENCY, async (acc) => {
    await markStatus("accounts", acc.id, "enriching");
    await emit({ type: "account", id: acc.id, status: "enriching" });
    const result = await enrichAccountStep(
      acc.id,
      {
        company_name: acc.company_name,
        company_domain: acc.company_domain,
        company_linkedin: acc.company_linkedin,
      },
      spec,
    );
    await emit({
      type: "account",
      id: result.id,
      status: result.ok ? "enriched" : "failed",
      error: result.error,
    });
  });

  // Re-read account context so contacts benefit from enriched company info.
  const accountContext = await fetchAccountContextMap(campaignId);

  // Enrich contacts with bounded concurrency.
  await runBatched(contacts, CONCURRENCY, async (contact) => {
    await markStatus("contacts", contact.id, "enriching");
    await emit({ type: "contact", id: contact.id, status: "enriching" });
    const accountInfo = contact.account_id
      ? accountContext.get(contact.account_id)
      : undefined;
    const result = await enrichContactStep(
      contact.id,
      {
        email: contact.email,
        first_name: contact.first_name,
        last_name: contact.last_name,
        contact_linkedin: contact.contact_linkedin,
        job_title: contact.job_title,
        company_name: accountInfo?.company_name ?? null,
        company_domain: accountInfo?.company_domain ?? null,
      },
      spec,
    );
    await emit({
      type: "contact",
      id: result.id,
      status: result.ok ? "enriched" : "failed",
      error: result.error,
    });
  });

  await finalizeCampaign(campaignId);
  // Kick off Phase 4 (marketing strategist) as soon as enrichment finishes,
  // so the user lands on the emails page with a strategy already in flight.
  await kickOffStrategy(campaignId);
  await emit({ type: "done" });

  return { campaignId, accounts: accounts.length, contacts: contacts.length };
}
