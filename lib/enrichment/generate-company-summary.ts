import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL_ID = "anthropic/claude-sonnet-4.6";

export const companySummarySchema = z.object({
  summary: z
    .string()
    .min(40)
    .describe(
      "2-3 sentences on what this company does, who it sells to, and why it matters in its market.",
    ),
  angle: z
    .string()
    .min(30)
    .describe(
      "One-sentence opening angle the email writer should reach for with THIS company — tied to the campaign brief.",
    ),
  insights: z
    .array(z.string().min(8))
    .min(1)
    .max(5)
    .describe(
      "Concrete, testable signals from the enriched data worth highlighting (news, hiring, custom field values, growth stage, etc.).",
    ),
});

export type CompanySummary = z.infer<typeof companySummarySchema>;

type AccountInput = {
  company_name: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_description: string | null;
  industry_iso: string | null;
  employee_count: number | null;
  hq_country: string | null;
  funding_stage: string | null;
  custom_data: Record<string, unknown> | null;
};

type CampaignBrief = {
  campaign_type: string | null;
  audience: string | null;
  // `goals` comes out of the DB as unknown JSON; caller passes through.
  goals: unknown;
};

const SYSTEM_PROMPT = `You are a B2B research analyst preparing a one-screen briefing on a single company for a sales team. You have:
- The campaign brief (what the team is selling, to whom, and their ranked goals).
- Enriched firmographics and any custom fields gathered during research.

Produce exactly three things:
1. summary: 2-3 tight sentences — what the company does, who they sell to, why they matter in their market. No fluff.
2. angle: ONE sentence the email writer can use as an opener for this specific company, tied to the campaign's selling point. Concrete, not generic.
3. insights: 2-5 bullet-sized signals from the enriched data worth knowing (news, hiring, custom field values, funding, scale). Each is one concrete sentence.

Rules: terse, evidence-led, no hedging. If a field is empty or thin, omit it — do not invent.`;

function buildUserPrompt(account: AccountInput, brief: CampaignBrief): string {
  const lines: string[] = [];

  lines.push("# Campaign brief");
  lines.push(`Selling: ${brief.campaign_type ?? "(not specified)"}`);
  lines.push(`Audience: ${brief.audience ?? "(not specified)"}`);
  if (Array.isArray(brief.goals) && brief.goals.length > 0) {
    lines.push("Ranked goals:");
    for (const [i, g] of brief.goals.entries()) {
      const id =
        g && typeof g === "object" && "id" in g
          ? String((g as { id: unknown }).id)
          : String(g);
      lines.push(`  ${i + 1}. ${id}`);
    }
  }
  lines.push("");
  lines.push("# Company");
  lines.push(`Name: ${account.company_name ?? "(unknown)"}`);
  if (account.company_domain) lines.push(`Domain: ${account.company_domain}`);
  if (account.company_website) lines.push(`Website: ${account.company_website}`);
  if (account.company_description)
    lines.push(`Description: ${account.company_description}`);
  if (account.industry_iso) lines.push(`Industry: ${account.industry_iso}`);
  if (typeof account.employee_count === "number")
    lines.push(`Employees: ${account.employee_count}`);
  if (account.hq_country) lines.push(`HQ: ${account.hq_country}`);
  if (account.funding_stage) lines.push(`Funding stage: ${account.funding_stage}`);

  if (account.custom_data && Object.keys(account.custom_data).length > 0) {
    lines.push("");
    lines.push("# Custom research");
    for (const [k, v] of Object.entries(account.custom_data)) {
      if (v === null || v === undefined || v === "") continue;
      const rendered =
        typeof v === "string"
          ? v
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : JSON.stringify(v);
      lines.push(`- ${k}: ${rendered}`);
    }
  }

  return lines.join("\n");
}

export async function generateCompanySummary(
  account: AccountInput,
  brief: CampaignBrief,
): Promise<CompanySummary> {
  try {
    const { output } = await generateText({
      model: MODEL_ID,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(account, brief),
      output: Output.object({ schema: companySummarySchema }),
      maxOutputTokens: 4000,
    });
    return output;
  } catch (err) {
    const anyErr = err as { text?: string; cause?: unknown; message?: string };
    console.error("[generateCompanySummary] failed:", {
      message: anyErr.message,
      text: anyErr.text?.slice(0, 2000),
      cause: anyErr.cause,
    });
    throw err;
  }
}
