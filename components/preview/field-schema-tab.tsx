"use client";

import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import {
  ENRICHMENT_SOURCE_LABEL,
  type CustomField,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";

type Props = {
  spec: EnrichmentSpec | null;
};

type Row = {
  name: string;
  type: string;
  description: string;
  source: string;
  provenance: "standard" | "custom";
};

/**
 * Tab 1: read-only view of the research plan.
 *
 * Top: the strategist's high-level summary distilled to 3 bullets.
 * Below: company & contact field tables (standard + custom), columns
 * Name | Type | Description | Source.
 */
export function FieldSchemaTab({ spec }: Props) {
  const accountRows = rowsFor(
    STANDARD_ACCOUNT_FIELDS,
    spec?.account.custom_fields ?? [],
  );
  const contactRows = rowsFor(
    STANDARD_CONTACT_FIELDS,
    spec?.contact.custom_fields ?? [],
  );

  return (
    <div className="flex flex-col gap-10">
      {/* Enrichment plan — top summary */}
      <section>
        <h2 className="text-sm font-semibold text-foreground">
          Enrichment plan
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
          How we researched your accounts and contacts.
        </p>

        <ol className="mt-4 space-y-3">
          {planSteps(spec).map((step, idx) => (
            <li
              key={idx}
              className="flex gap-3 rounded-md border border-border bg-surface/40 px-4 py-3"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-[10px] font-mono text-accent">
                {idx + 1}
              </span>
              <div className="text-[13px] leading-relaxed text-foreground">
                {step}
              </div>
            </li>
          ))}
        </ol>

        {spec?.summary && (
          <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
            {spec.summary}
          </p>
        )}
      </section>

      {/* Company fields table */}
      <FieldsTable
        title="Company fields"
        subtitle="What we gathered on each account."
        rows={accountRows}
      />

      {/* Contact fields table */}
      <FieldsTable
        title="Contact fields"
        subtitle="What we gathered on each person."
        rows={contactRows}
      />
    </div>
  );
}

function FieldsTable({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Row[];
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          {rows.length} fields
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[12px]">
          <thead className="bg-surface/60">
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <th className="w-1/4 px-3 py-2 font-medium">Name</th>
              <th className="w-[88px] px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="w-[180px] px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.name}-${i}`}
                className="border-t border-border/60 align-top hover:bg-surface/30"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {row.name}
                    </span>
                    {row.provenance === "custom" && (
                      <span className="rounded-sm border border-accent/40 bg-accent/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-accent">
                        custom
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {row.type}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.description || <span className="opacity-50">—</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.source}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function rowsFor(
  standard: readonly StandardField[],
  custom: CustomField[],
): Row[] {
  const stdRows: Row[] = standard.map((f) => ({
    name: f.title,
    type: f.type,
    description: "",
    source: "Standard field",
    provenance: "standard",
  }));

  const customRows: Row[] = custom.map((f) => ({
    name: f.title,
    type: f.type,
    description: f.description,
    source: formatSource(f),
    provenance: "custom",
  }));

  return [...stdRows, ...customRows];
}

function formatSource(f: CustomField): string {
  const primary = ENRICHMENT_SOURCE_LABEL[f.enrichment.primary_source];
  if (!f.enrichment.fallback_source) return primary;
  const fallback = ENRICHMENT_SOURCE_LABEL[f.enrichment.fallback_source];
  return `${primary} → ${fallback}`;
}

function planSteps(spec: EnrichmentSpec | null): string[] {
  if (!spec) {
    return [
      "Find each company — resolve domain, LinkedIn, and basic firmographics.",
      "Research signals — gather the custom fields your brief called for.",
      "Enrich contacts — title, seniority, department, and personalization hooks.",
    ];
  }
  const accountCount = spec.account.custom_fields.length;
  const contactCount = spec.contact.custom_fields.length;
  return [
    "Find each company — resolve domain, LinkedIn, and standard firmographics.",
    accountCount > 0
      ? `Research ${accountCount} custom signal${accountCount === 1 ? "" : "s"} per company.`
      : "No custom company fields were needed — standard firmographics only.",
    contactCount > 0
      ? `Enrich each contact with ${contactCount} custom field${contactCount === 1 ? "" : "s"} plus standard attributes.`
      : "Enrich each contact with standard attributes (title, seniority, department).",
  ];
}
