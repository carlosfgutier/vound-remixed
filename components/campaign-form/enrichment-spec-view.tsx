import Link from "next/link";
import { ArrowRight, Sparkles, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import {
  ENRICHMENT_SOURCE_LABEL,
  type EnrichmentSpec,
  type CustomField,
} from "@/lib/schema/enrichment-spec";
import { CAMPAIGN_GOALS } from "@/lib/campaign-goals";
import type { RankedGoal } from "@/lib/schema/campaign-input";

type Props = {
  spec: EnrichmentSpec;
  goals: RankedGoal[];
  campaignId: string;
};

export function EnrichmentSpecView({ spec, goals, campaignId }: Props) {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-accent/40 bg-accent/5 p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span className="label-mono text-accent">Enrichment spec ready</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-foreground">
          {spec.summary}
        </p>
      </div>

      <LevelSection
        title="Account-level fields"
        subtitle="What we research about each company"
        standard={STANDARD_ACCOUNT_FIELDS}
        custom={spec.account.custom_fields}
      />

      <LevelSection
        title="Contact-level fields"
        subtitle="What we research about each person"
        standard={STANDARD_CONTACT_FIELDS}
        custom={spec.contact.custom_fields}
      />

      <RubricSection goals={goals} spec={spec} />

      <HooksSection spec={spec} />

      <div className="flex justify-end border-t border-border pt-6">
        <Button asChild variant="primary">
          <Link href={`/campaigns/${campaignId}/enrichment`}>
            Run enrichment
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function LevelSection({
  title,
  subtitle,
  standard,
  custom,
}: {
  title: string;
  subtitle: string;
  standard: readonly StandardField[];
  custom: CustomField[];
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="label-mono">
          {standard.length} standard · {custom.length} custom
        </span>
      </div>

      <div className="space-y-2">
        <div className="label-mono">Standard</div>
        <div className="flex flex-wrap gap-1.5">
          {standard.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface/40 px-2 py-1 text-[11px] text-foreground"
            >
              {f.title}
              <span className="font-mono text-[10px] text-muted-foreground">
                {f.type}
              </span>
            </span>
          ))}
        </div>
      </div>

      {custom.length > 0 && (
        <div className="space-y-2">
          <div className="label-mono text-accent">Custom</div>
          <div className="space-y-2">
            {custom.map((f) => (
              <CustomFieldCard key={f.key} field={f} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function CustomFieldCard({ field }: { field: CustomField }) {
  return (
    <div className="rounded-lg border border-border bg-surface/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-foreground">
              {field.title}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {field.key}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              · {field.type}
              {field.type === "enum" && field.enum_values?.length
                ? ` (${field.enum_values.length})`
                : ""}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {field.description}
          </p>
        </div>
        <SourceBadge source={field.enrichment.primary_source} />
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <div>
          <div className="label-mono">Query template</div>
          <code className="mt-1 block overflow-x-auto rounded-md border border-border bg-background/60 px-2 py-1.5 font-mono text-[11px] text-foreground">
            {field.enrichment.query_template}
          </code>
        </div>
        <div>
          <div className="label-mono">Why</div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {field.enrichment.reasoning}
          </p>
        </div>
        {field.enrichment.fallback_source && (
          <div className="flex items-center gap-2">
            <span className="label-mono">Fallback</span>
            <SourceBadge source={field.enrichment.fallback_source} muted />
          </div>
        )}
      </div>
    </div>
  );
}

function SourceBadge({
  source,
  muted = false,
}: {
  source: keyof typeof ENRICHMENT_SOURCE_LABEL;
  muted?: boolean;
}) {
  return (
    <span
      className={
        muted
          ? "inline-flex shrink-0 items-center rounded-md border border-border bg-surface/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground"
          : "inline-flex shrink-0 items-center rounded-md border border-accent/40 bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-accent"
      }
    >
      {ENRICHMENT_SOURCE_LABEL[source]}
    </span>
  );
}

function RubricSection({
  goals,
  spec,
}: {
  goals: RankedGoal[];
  spec: EnrichmentSpec;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">
          Qualification rubric
        </h3>
      </div>
      <div className="space-y-3">
        {spec.qualification_rubric.map((rule, i) => {
          const goal = goals.find((g) => g.id === rule.goal_id);
          const base = CAMPAIGN_GOALS.find((cg) => cg.id === rule.goal_id);
          const label = goal?.customLabel ?? base?.label ?? rule.goal_id;
          return (
            <div
              key={`${rule.goal_id}-${i}`}
              className="rounded-lg border border-border bg-surface/30 p-4"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  #{i + 1}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {label}
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="label-mono text-success">Signals</div>
                  <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
                    {rule.signals.map((s, idx) => (
                      <li key={idx} className="flex gap-1.5">
                        <span className="text-success">+</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {rule.disqualifiers.length > 0 && (
                  <div>
                    <div className="label-mono text-destructive">
                      Disqualifiers
                    </div>
                    <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-muted-foreground">
                      {rule.disqualifiers.map((s, idx) => (
                        <li key={idx} className="flex gap-1.5">
                          <span className="text-destructive">−</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HooksSection({ spec }: { spec: EnrichmentSpec }) {
  if (spec.personalization_hooks.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-accent" />
        <h3 className="text-sm font-semibold text-foreground">
          Personalization hooks
        </h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {spec.personalization_hooks.map((hook, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-surface/30 p-4"
          >
            <div className="text-sm font-medium text-foreground">
              {hook.title}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {hook.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {hook.uses_fields.map((key) => (
                <span
                  key={key}
                  className="rounded-sm border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  {key}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
