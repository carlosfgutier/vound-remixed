import { notFound } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { MessagingWorkbench } from "@/components/messaging/messaging-workbench";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";

export const metadata = {
  title: "Emails · vBound",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EmailsPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = getSupabaseAdmin();

  const [{ data: campaign, error: campaignError }, accountsResult, contactsResult] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, campaign_type, email_strategy, strategy_run_id",
        )
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
          "id, account_id, email, first_name, last_name, contact_linkedin, job_title, seniority, department, contact_country, custom_data, email_overrides, enrichment_status",
        )
        .eq("campaign_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (campaignError || !campaign) notFound();

  const strategy = parseStrategy(campaign.email_strategy);

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
          <PhaseTracker current="emails" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Emails
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              The marketing strategist picked a framework and wrote a templated
              cadence. Template parts are shared across contacts; highlighted
              tokens are personalized per contact using enriched data.
            </p>
          </div>

          <MessagingWorkbench
            campaignId={id}
            campaignName={campaign.name as string}
            initialStrategy={strategy}
            initialRunId={(campaign.strategy_run_id as string | null) ?? null}
            accounts={(accountsResult.data ?? []) as AccountLite[]}
            contacts={(contactsResult.data ?? []) as ContactLite[]}
          />
        </div>
      </div>
    </div>
  );
}

function parseStrategy(raw: unknown): EmailStrategy | null {
  if (!raw) return null;
  const result = emailStrategySchema.safeParse(raw);
  return result.success ? result.data : null;
}

type AccountLite = {
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
};

type ContactLite = {
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
  email_overrides: Record<string, string> | null;
  enrichment_status: string;
};
