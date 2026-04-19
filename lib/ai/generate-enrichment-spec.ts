import "server-only";
import { generateText, Output } from "ai";
import { CAMPAIGN_GOALS } from "@/lib/campaign-goals";
import type { CampaignInput } from "@/lib/schema/campaign-input";
import {
  enrichmentSpecSchema,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";

const MODEL_ID = "anthropic/claude-sonnet-4.6";

const SYSTEM_PROMPT = `You are an outbound enrichment strategist for a B2B GTM platform. Given a campaign brief, you design the research spec: the custom data points to gather about each account and contact, beyond the standard fields already in the CRM.

Constraints:
- Standard fields already exist (company name, domain, website, LinkedIn URL, description, industry, employee count, HQ country, funding stage, email, first/last name, contact LinkedIn URL, job title, seniority, department, contact country). DO NOT propose anything that duplicates them.
- Max 5 custom account fields, max 5 custom contact fields. Fewer is better if they're sharper.
- Every custom field must pay rent: either it directly supports qualification against the campaign's top-ranked goal, OR it feeds a specific personalization hook. If you can't justify it, cut it.
- field.key must be snake_case (lowercase letters, digits, underscores; starts with a letter).
- enrichment.primary_source MUST be one of: company_website, linkedin_company, linkedin_profile, linkedin_posts, github, news_search, job_posts, web_search, crm_existing.
- query_template is a short natural-language query the enrichment tool will run. Use {{placeholder}} for values to substitute at runtime (e.g. {{company_domain}}, {{contact_linkedin}}, {{first_name}}). Keep it tight.
- qualification_rubric: one entry per campaign goal, in the order goals were ranked. signals = what "good fit" looks like in the enriched data. disqualifiers = hard nos. Each signal/disqualifier is one concrete, testable sentence.
- personalization_hooks: concrete angles the email writer can reach for. Each hook must list the field keys it depends on (standard keys OK). Max 5.
- summary: 2-3 sentence executive summary of the spec — what the AI will learn about prospects and why those specific signals matter for this campaign.

Style: terse, concrete, no hedging. Each description answers "what is this and why do we need it?" in one sentence.`;

function buildUserPrompt(input: CampaignInput): string {
  const goalLines = input.goals
    .map((g, i) => {
      const base = CAMPAIGN_GOALS.find((cg) => cg.id === g.id);
      const label = g.id === "other" ? (g.customLabel ?? "Other") : base?.label ?? g.id;
      return `${i + 1}. ${g.id} — ${label}`;
    })
    .join("\n");

  const csvColumns = input.contacts.detectedColumns.join(", ") || "(none detected)";

  return `Campaign type:
${input.campaignType}

Audience:
${input.audience}

Ranked goals (most important first):
${goalLines}

Imported CRM columns:
${csvColumns}`;
}

export async function generateEnrichmentSpec(
  input: CampaignInput,
): Promise<EnrichmentSpec> {
  try {
    const { output } = await generateText({
      model: MODEL_ID,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(input),
      output: Output.object({ schema: enrichmentSpecSchema }),
      maxOutputTokens: 16000,
    });
    return output;
  } catch (err) {
    // Log raw AI output + validation cause so we can iterate on prompt/schema.
    const anyErr = err as { text?: string; cause?: unknown; message?: string };
    console.error("[generateEnrichmentSpec] failed:", {
      message: anyErr.message,
      text: anyErr.text?.slice(0, 4000),
      cause: anyErr.cause,
    });
    throw err;
  }
}
