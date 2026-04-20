import { notFound } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { SequenceWorkbench } from "@/components/sequence/sequence-workbench";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  emailStrategySchema,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";
import type { SequenceState, SendStatus } from "@/lib/sequence/types";

export const metadata = {
  title: "Sequence · vBound",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function SequencePage({ params }: PageProps) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [
    { data: campaign, error: campaignError },
    contactsResult,
    sendsResult,
  ] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, name, campaign_type, demo_mode, email_strategy, launch_run_id, status",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select(
        "id, email, first_name, last_name, job_title, sequence_state, current_step, exited_at, exit_reason, enrichment_status",
      )
      .eq("campaign_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("email_sends")
      .select(
        "id, contact_id, step, status, subject, sent_at, delivered_at, replied_at, bounced_at, complained_at, error",
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
          <PhaseTracker current="sequence" campaignId={id} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Sequence</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              Launch the campaign to spawn a durable workflow per contact. Each
              run renders the strategy, sends step-by-step on the cadence, and
              exits on reply, bounce, or complaint.
            </p>
          </div>

          <SequenceWorkbench
            campaignId={id}
            campaignName={campaign.name as string}
            demoMode={Boolean(campaign.demo_mode)}
            status={campaign.status as string}
            strategy={strategy}
            initialRunId={(campaign.launch_run_id as string | null) ?? null}
            contacts={(contactsResult.data ?? []) as ContactLite[]}
            sends={(sendsResult.data ?? []) as SendLite[]}
          />
        </div>
      </div>
    </div>
  );
}

function parseStrategy(raw: unknown): EmailStrategy | null {
  if (!raw) return null;
  const parsed = emailStrategySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ContactLite = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  sequence_state: SequenceState;
  current_step: number;
  exited_at: string | null;
  exit_reason: string | null;
  enrichment_status: string;
};

export type SendLite = {
  id: string;
  contact_id: string;
  step: number;
  status: SendStatus;
  subject: string;
  sent_at: string | null;
  delivered_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  error: string | null;
};
