import { notFound } from "next/navigation";
import { PhaseTracker } from "@/components/phase-tracker/phase-tracker";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { CAMPAIGN_GOALS } from "@/lib/campaign-goals";
import { BUILT_IN_PROVIDERS } from "@/components/campaign-form/providers";

export const metadata = {
  title: "Details · vound",
};

type PageProps = { params: Promise<{ id: string }> };

type RankedGoal = { id: string; customLabel?: string };

/**
 * Read-only snapshot of the Details step for an existing campaign.
 * Shows the brief, audience, ranked goals, enrichment providers, and a
 * quick audience tally — exactly what the user submitted at /campaigns/new,
 * frozen in place. Reached via the Details step in the phase tracker once a
 * campaign exists.
 */
export default async function CampaignDetailsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const [{ data: campaign, error: campaignError }, accountsCount, contactsCount] =
    await Promise.all([
      supabase
        .from("campaigns")
        .select(
          "id, name, campaign_type, audience, goals, providers, created_at, email_strategy",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id),
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id),
    ]);

  if (campaignError || !campaign) notFound();

  const rankedGoals = parseGoals(campaign.goals);
  const providers = parseProviders(campaign.providers);
  const createdAt = new Date(campaign.created_at as string);
  // If the strategy has been generated, Loading is complete — unlock the
  // downstream phases so the user can bounce back to Preview/Sequence from
  // this read-only snapshot.
  const strategyReady = campaign.email_strategy != null;

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
          <PhaseTracker
            current="details"
            campaignId={id}
            unlockFuture={strategyReady}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 py-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                Submitted brief
              </h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Frozen at submission — edits would require a new campaign.
              </p>
            </div>
            <div className="text-right font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <div>Created</div>
              <div className="mt-0.5 text-foreground">
                {formatDate(createdAt)}
              </div>
            </div>
          </div>

          <div className="mt-8 space-y-8">
            <Section title="Campaign">
              <Field label="Name" value={campaign.name as string} />
              <LongField
                label="What kind of campaign"
                value={campaign.campaign_type as string}
              />
              <LongField
                label="Audience"
                value={campaign.audience as string}
              />
            </Section>

            <Section
              title="Campaign goals"
              right={
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {rankedGoals.length} ranked
                </span>
              }
            >
              {rankedGoals.length === 0 ? (
                <EmptyNote>No goals selected.</EmptyNote>
              ) : (
                <ol className="space-y-1.5">
                  {rankedGoals.map((goal, idx) => (
                    <li
                      key={`${goal.id}-${idx}`}
                      className="flex items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 font-mono text-[10px] text-accent">
                        {idx + 1}
                      </span>
                      <span className="text-[13px] text-foreground">
                        {goalLabel(goal)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            <Section
              title="Enrichment providers"
              right={
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {providers.length} selected
                </span>
              }
            >
              {providers.length === 0 ? (
                <EmptyNote>No providers selected.</EmptyNote>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {providers.map((pid) => (
                    <ProviderPill key={pid} id={pid} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Audience imported">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  label="Contacts"
                  value={contactsCount.count ?? 0}
                />
                <StatCard
                  label="Companies"
                  value={accountsCount.count ?? 0}
                />
                <StatCard
                  label="Providers"
                  value={providers.length}
                />
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- helpers ---------------------------------------------------------------

function parseGoals(raw: unknown): RankedGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: RankedGoal[] = [];
  for (const item of raw) {
    if (item && typeof item === "object" && "id" in item) {
      const obj = item as Record<string, unknown>;
      out.push({
        id: String(obj.id),
        customLabel:
          typeof obj.customLabel === "string" ? obj.customLabel : undefined,
      });
    }
  }
  return out;
}

function parseProviders(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function goalLabel(goal: RankedGoal): string {
  if (goal.id === "other" && goal.customLabel) return goal.customLabel;
  const base = CAMPAIGN_GOALS.find((g) => g.id === goal.id);
  return base?.label ?? goal.id;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// --- presentational bits ---------------------------------------------------

function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function LongField({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
        {value}
      </p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface/20 px-3 py-4 text-center text-[12px] text-muted-foreground">
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-border bg-surface/40 px-3 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ProviderPill({ id }: { id: string }) {
  const match = BUILT_IN_PROVIDERS.find((p) => p.id === id);
  const label = match?.label ?? id;
  const initials = label.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5">
      <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-accent/40 bg-accent/15 font-mono text-[9px] font-medium text-accent">
        {initials}
      </span>
      <span className="text-[12px] font-medium text-foreground">{label}</span>
    </span>
  );
}
