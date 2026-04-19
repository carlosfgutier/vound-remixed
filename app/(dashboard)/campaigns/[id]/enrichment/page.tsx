import { notFound } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import {
  EnrichmentTables,
  type AccountRow,
  type ContactRow,
} from "@/components/enrichment/enrichment-tables";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";

export const metadata = {
  title: "Enrichment · vBound",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EnrichmentPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdmin();

  const [{ data: campaign, error: campaignError }, accountsResult, contactsResult] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select("id, name, campaign_type, enrichment_spec")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select(
          "id, company_name, company_linkedin, company_domain, company_website, company_description, industry_iso, employee_count, hq_country, funding_stage, custom_data, enrichment_status",
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

  const spec = parseSpec(campaign.enrichment_spec);
  const accounts = (accountsResult.data ?? []) as AccountRow[];
  const contacts = (contactsResult.data ?? []) as ContactRow[];

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
          <PhaseTracker current="enrichment" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Enrichment
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Standard columns come from your import. Custom columns (highlighted)
              come from the spec — vBound will fill them in.
            </p>
          </div>

          <EnrichmentTables
            accounts={accounts}
            contacts={contacts}
            accountCustomFields={spec?.account.custom_fields ?? []}
            contactCustomFields={spec?.contact.custom_fields ?? []}
          />
        </div>
      </div>
    </div>
  );
}

function parseSpec(raw: unknown): EnrichmentSpec | null {
  const result = enrichmentSpecSchema.safeParse(raw);
  return result.success ? result.data : null;
}
