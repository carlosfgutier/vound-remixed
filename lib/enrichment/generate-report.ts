import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  enrichmentSpecSchema,
  type CustomField,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";
import {
  STANDARD_ACCOUNT_FIELDS,
  STANDARD_CONTACT_FIELDS,
  type StandardField,
} from "@/lib/campaign-standard-fields";
import type { FieldProvenance } from "@/lib/enrichment/reconcile";

const MODEL_ID = "anthropic/claude-sonnet-4.6";

export type ReportResult =
  | { ready: true; markdown: string }
  | { ready: false; reason: string };

type AccountRow = {
  id: string;
  company_name: string | null;
  company_domain: string | null;
  custom_data: Record<string, unknown> | null;
  provenance: Record<string, FieldProvenance> | null;
  enrichment_status: string;
  enrichment_error: string | null;
  [key: string]: unknown;
};

type ContactRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  custom_data: Record<string, unknown> | null;
  provenance: Record<string, FieldProvenance> | null;
  enrichment_status: string;
  enrichment_error: string | null;
  [key: string]: unknown;
};

type FieldSpec = {
  key: string;
  title: string;
  kind: "standard" | "custom";
  reasoning: string | null; // from spec.enrichment.reasoning (custom fields only)
};

function buildFieldSpec(
  standard: readonly StandardField[],
  custom: CustomField[],
  excludeKeys: Set<string> = new Set(),
): FieldSpec[] {
  const out: FieldSpec[] = [];
  for (const f of standard) {
    if (excludeKeys.has(f.key)) continue;
    out.push({ key: f.key, title: f.title, kind: "standard", reasoning: null });
  }
  for (const f of custom) {
    out.push({
      key: f.key,
      title: f.title,
      kind: "custom",
      reasoning: f.enrichment.reasoning ?? null,
    });
  }
  return out;
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 77) + "…" : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v))
    return v
      .map((x) => fmtValue(x))
      .join(", ")
      .slice(0, 120);
  return JSON.stringify(v).slice(0, 120);
}

function derivedReason(p: FieldProvenance | undefined): string {
  if (!p) return "No provenance recorded.";
  switch (p.source) {
    case "both":
      return `AI and provider agreed on \`${fmtValue(p.chosen)}\`.`;
    case "provider": {
      const ai = fmtValue(p.ai);
      if (ai === "—") {
        return `Provider returned \`${fmtValue(p.provider)}\`; AI had no data.`;
      }
      return `AI and provider disagreed — provider won with \`${fmtValue(
        p.provider,
      )}\`, AI suggested \`${ai}\`.`;
    }
    case "ai":
      return `AI returned \`${fmtValue(p.ai)}\`; provider had no data.`;
    case "none":
      return `Neither AI nor provider returned a value.`;
    default:
      return "Unknown provenance source.";
  }
}

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function isRowFullyEnriched(
  row: { custom_data: Record<string, unknown> | null; [key: string]: unknown },
  fields: FieldSpec[],
): boolean {
  for (const f of fields) {
    const value =
      f.kind === "standard"
        ? (row as Record<string, unknown>)[f.key]
        : row.custom_data?.[f.key];
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
  }
  return true;
}

type TableStats = {
  label: string;
  total: number;
  enriched: number;
  failed: number;
  fullyEnriched: number;
  fieldCompleteness: Array<{ key: string; title: string; filled: number; total: number }>;
  fieldSourceBreakdown: Array<{
    key: string;
    title: string;
    ai: number;
    provider: number;
    both: number;
    none: number;
  }>;
};

function computeTableStats(
  label: string,
  rows: Array<{
    custom_data: Record<string, unknown> | null;
    provenance: Record<string, FieldProvenance> | null;
    enrichment_status: string;
    [key: string]: unknown;
  }>,
  fields: FieldSpec[],
): TableStats {
  const total = rows.length;
  const enriched = rows.filter((r) => r.enrichment_status === "enriched").length;
  const failed = rows.filter((r) => r.enrichment_status === "failed").length;
  const fullyEnriched = rows.filter(
    (r) => r.enrichment_status === "enriched" && isRowFullyEnriched(r, fields),
  ).length;

  const fieldCompleteness = fields.map((f) => {
    let filled = 0;
    for (const row of rows) {
      const value =
        f.kind === "standard"
          ? (row as Record<string, unknown>)[f.key]
          : row.custom_data?.[f.key];
      const empty =
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0);
      if (!empty) filled += 1;
    }
    return { key: f.key, title: f.title, filled, total };
  });

  const fieldSourceBreakdown = fields.map((f) => {
    const counts = { ai: 0, provider: 0, both: 0, none: 0 };
    for (const row of rows) {
      const p = row.provenance?.[f.key];
      if (!p) continue;
      counts[p.source] += 1;
    }
    return { key: f.key, title: f.title, ...counts };
  });

  return { label, total, enriched, failed, fullyEnriched, fieldCompleteness, fieldSourceBreakdown };
}

function renderStatsSection(stats: TableStats[]): string {
  const lines: string[] = [];
  lines.push(`## General summary`);
  lines.push("");
  for (const s of stats) {
    lines.push(`### ${s.label}`);
    lines.push("");
    lines.push(`- Total: **${s.total}**`);
    lines.push(
      `- Enriched: **${s.enriched}** (${pct(s.enriched, s.total)})`,
    );
    lines.push(`- Failed: **${s.failed}** (${pct(s.failed, s.total)})`);
    lines.push(
      `- Fully enriched (all fields populated): **${s.fullyEnriched}** (${pct(
        s.fullyEnriched,
        s.total,
      )})`,
    );
    lines.push("");
  }
  return lines.join("\n");
}

function renderFieldStatsSection(stats: TableStats[]): string {
  const lines: string[] = [];
  lines.push(`## Per-field completeness`);
  lines.push("");
  for (const s of stats) {
    lines.push(`### ${s.label}`);
    lines.push("");
    lines.push(`| Field | Filled | % | AI | Provider | Both | None |`);
    lines.push(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
    for (let i = 0; i < s.fieldCompleteness.length; i++) {
      const fc = s.fieldCompleteness[i]!;
      const sb = s.fieldSourceBreakdown[i]!;
      lines.push(
        `| ${fc.title} | ${fc.filled}/${fc.total} | ${pct(fc.filled, fc.total)} | ${sb.ai} | ${sb.provider} | ${sb.both} | ${sb.none} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderDetailSection(
  label: string,
  rows: Array<{
    id: string;
    custom_data: Record<string, unknown> | null;
    provenance: Record<string, FieldProvenance> | null;
    enrichment_status: string;
    enrichment_error: string | null;
    [key: string]: unknown;
  }>,
  fields: FieldSpec[],
  rowLabel: (row: Record<string, unknown>) => string,
): string {
  const lines: string[] = [];
  lines.push(`## ${label}: detailed field resolutions`);
  lines.push("");
  if (rows.length === 0) {
    lines.push(`_No ${label.toLowerCase()} to report._`);
    lines.push("");
    return lines.join("\n");
  }
  for (const row of rows) {
    const title = rowLabel(row as Record<string, unknown>);
    lines.push(`### ${title}`);
    lines.push("");
    lines.push(`- Status: \`${row.enrichment_status}\``);
    if (row.enrichment_status === "failed" && row.enrichment_error) {
      lines.push(`- Error: ${row.enrichment_error}`);
      lines.push("");
      continue;
    }
    for (const f of fields) {
      const value =
        f.kind === "standard"
          ? (row as Record<string, unknown>)[f.key]
          : row.custom_data?.[f.key];
      const prov = row.provenance?.[f.key];
      lines.push(`- **${f.title}** — \`${fmtValue(value)}\``);
      lines.push(`  - Resolution: ${derivedReason(prov)}`);
      if (f.reasoning) {
        lines.push(`  - Why this field matters: ${f.reasoning}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

type AiSummarySection = {
  executive_summary: string;
  insights: string[];
};

const aiSummarySchema = z.object({
  executive_summary: z.string(),
  insights: z.array(z.string()).min(2).max(5),
});

async function generateAiSummary(
  spec: EnrichmentSpec,
  accountStats: TableStats,
  contactStats: TableStats,
): Promise<AiSummarySection> {
  const system = `You are a GTM analyst summarizing a B2B outbound-enrichment run. You receive: (1) the campaign's qualification goals, (2) aggregate stats for accounts and contacts (completeness, source breakdown), and (3) nothing else.

Rules:
- Be concrete, specific, and quantitative. Cite numbers from the stats.
- Executive summary: 2-3 sentences, plain prose, no bullet points.
- Insights: 2-5 bullet-point-worthy observations. Each should be one sentence that names a pattern, risk, or recommendation actionable by a GTM team.
- Do not invent data that isn't in the stats.
- Do not fabricate field values — only reason about coverage, sources, and patterns.`;

  const prompt = `# Campaign goals
${spec.summary}

# Account enrichment stats
Total: ${accountStats.total}
Enriched: ${accountStats.enriched}
Failed: ${accountStats.failed}
Fully enriched (all fields populated): ${accountStats.fullyEnriched}

## Per-field coverage (accounts)
${accountStats.fieldCompleteness
  .map((fc, i) => {
    const sb = accountStats.fieldSourceBreakdown[i]!;
    return `- ${fc.title}: ${fc.filled}/${fc.total} filled (${pct(fc.filled, fc.total)}) — AI:${sb.ai} Provider:${sb.provider} Both:${sb.both} None:${sb.none}`;
  })
  .join("\n")}

# Contact enrichment stats
Total: ${contactStats.total}
Enriched: ${contactStats.enriched}
Failed: ${contactStats.failed}
Fully enriched: ${contactStats.fullyEnriched}

## Per-field coverage (contacts)
${contactStats.fieldCompleteness
  .map((fc, i) => {
    const sb = contactStats.fieldSourceBreakdown[i]!;
    return `- ${fc.title}: ${fc.filled}/${fc.total} filled (${pct(fc.filled, fc.total)}) — AI:${sb.ai} Provider:${sb.provider} Both:${sb.both} None:${sb.none}`;
  })
  .join("\n")}

# Task
Produce:
1. executive_summary — 2-3 sentences describing overall enrichment health and how well it supports the campaign goals.
2. insights — 2-5 specific, actionable observations about field coverage, source reliability, gaps, or next steps.`;

  const { output } = await generateText({
    model: MODEL_ID,
    system,
    prompt,
    output: Output.object({ schema: aiSummarySchema }),
    maxOutputTokens: 1000,
  });

  return output as AiSummarySection;
}

export async function generateEnrichmentReport(
  campaignId: string,
): Promise<ReportResult> {
  const supabase = getSupabaseAdmin();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, campaign_type, enrichment_spec")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return { ready: false, reason: campaignError?.message ?? "Campaign not found." };
  }

  const parsedSpec = enrichmentSpecSchema.safeParse(campaign.enrichment_spec);
  if (!parsedSpec.success) {
    return { ready: false, reason: "Campaign has no valid enrichment spec." };
  }
  const spec = parsedSpec.data;

  const [accountsResult, contactsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
    supabase
      .from("contacts")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  ]);

  if (accountsResult.error) return { ready: false, reason: accountsResult.error.message };
  if (contactsResult.error) return { ready: false, reason: contactsResult.error.message };

  const accounts = (accountsResult.data ?? []) as AccountRow[];
  const contacts = (contactsResult.data ?? []) as ContactRow[];

  const pendingRows =
    accounts.filter(
      (a) => a.enrichment_status !== "enriched" && a.enrichment_status !== "failed",
    ).length +
    contacts.filter(
      (c) => c.enrichment_status !== "enriched" && c.enrichment_status !== "failed",
    ).length;

  if (pendingRows > 0) {
    return {
      ready: false,
      reason: `Enrichment is still in progress (${pendingRows} row(s) not yet finished).`,
    };
  }

  const accountFields = buildFieldSpec(
    STANDARD_ACCOUNT_FIELDS,
    spec.account.custom_fields,
  );
  // Email is our import seed, not an enrichment target — exclude from field stats.
  const contactFields = buildFieldSpec(
    STANDARD_CONTACT_FIELDS,
    spec.contact.custom_fields,
    new Set(["email"]),
  );

  const accountStats = computeTableStats("Accounts", accounts, accountFields);
  const contactStats = computeTableStats("Contacts", contacts, contactFields);

  let ai: AiSummarySection;
  try {
    ai = await generateAiSummary(spec, accountStats, contactStats);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI summary failed.";
    return { ready: false, reason: `Report AI generation failed: ${message}` };
  }

  const header = [
    `# Enrichment report — ${campaign.name}`,
    ``,
    `_Campaign type: ${campaign.campaign_type}_`,
    ``,
    `## Executive summary`,
    ``,
    ai.executive_summary,
    ``,
    `## Key insights`,
    ``,
    ...ai.insights.map((line) => `- ${line}`),
    ``,
  ].join("\n");

  const statsSection = renderStatsSection([accountStats, contactStats]);
  const fieldStatsSection = renderFieldStatsSection([accountStats, contactStats]);
  const accountDetail = renderDetailSection(
    "Accounts",
    accounts,
    accountFields,
    (row) =>
      `${(row.company_name as string | null) ?? "(unknown)"} — ${
        (row.company_domain as string | null) ?? "(no domain)"
      }`,
  );
  const contactDetail = renderDetailSection(
    "Contacts",
    contacts,
    contactFields,
    (row) => {
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
      return `${name || "(no name)"} — ${row.email}`;
    },
  );

  const markdown = [
    header,
    statsSection,
    fieldStatsSection,
    accountDetail,
    contactDetail,
  ].join("\n");

  return { ready: true, markdown };
}
