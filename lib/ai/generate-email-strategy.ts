import "server-only";
import { generateText, Output } from "ai";
import {
  emailStrategySchema,
  FRAMEWORK_MAX_STEPS,
  type EmailStrategy,
} from "@/lib/schema/email-strategy";
import type { EnrichmentSpec } from "@/lib/schema/enrichment-spec";

const MODEL_ID = "anthropic/claude-sonnet-4.6";

// Flavour of the cold-email skill, distilled to what the strategist needs to
// make framework + copy decisions. Kept as a single string so the prompt stays
// readable and the source-of-truth is in one place.
const FRAMEWORK_BRIEF = `You are choosing between three cold-email frameworks.

## Frameworks

**PVP (Permissionless Value Prop)** — max 3 emails.
Use when the enriched data has high signal density (2+ public data points per account you can cross-reference). The value proposition is the research itself: lead with an observation only possible because you looked at specific data about *this* prospect. Email 1 earns the right to reply because it's clearly not a mass blast.

**PQS (Pain-Qualified Segment)** — max 4 emails.
Use when the campaign targets a specific, named pain in a tight segment and you have situational heuristics (triggers, recent events, hiring pattern, stack change) that suggest the pain is active *now*. Lead with the pain, not the product. Works with thinner data than PVP.

**Eric (Firmographic / Volume)** — max 4 emails.
Use when enrichment is firmographic (industry, size, funding, geography) rather than per-prospect narrative. Structure: E1 net new angle → E2 threaded bump on E1 → E3 net new angle (different offer category) → E4 threaded bump on E3. Pick 2 distinct angles from the 10-angle catalog: pain-focused, social proof, specific result, contrarian take, relevant trend, mutual connection, event/trigger, comparison to alternative, question, resource offer.

## Universal copy rules (apply to all frameworks)

- Subjects: lowercase, 2–5 words, no punctuation, no emojis.
- Never use em-dashes (—). Never use exclamation marks. Never use "!" anywhere.
- Single-sentence paragraphs. Body under 75 words for E1. Later steps can be shorter.
- No corporate buzzwords (synergy, leverage, unlock, empower, seamless, robust).
- CTA in E1 is reply-only ("open to a reply?" / "worth a reply?"). No calendar links, no meeting asks in E1.
- Offer categories rotate across steps: save time, save money, make money, reduce risk. Do not repeat a category within the same sequence.
- Hormozi spine: dream outcome + perceived likelihood + time delay + effort/sacrifice. At least one step should telegraph this spine.
- "Poke the bear": it's fine to be mildly pointed about the status quo the prospect is defending — but never insult them personally.
- "AI writes variables, not emails." The strategist designs templates with clear conditional slots; the actual per-contact strings are small, targeted inserts (one clause, one observation, one trigger), not a full regenerated email.

## Self-check before finalising a template

1. Could this email only have been written for this (type of) prospect? If it could be sent to anyone, it's too generic.
2. Is there exactly one ask per email? Multiple asks = confused email.
3. Does the value precede the ask? If the ask is in the first sentence, restructure.
4. Did you reuse an offer category? If yes, rotate.`;

const SYSTEM_PROMPT = `You are a B2B marketing strategist designing an outbound email sequence. You produce a *strategy* — framework choice + template sequence + personalization rules — not per-contact copy.

Your output is consumed by a deterministic renderer. The renderer:
1. Reads your \`tokens\` list and your \`personalization_rules\`.
2. For each contact, evaluates rules top-to-bottom. First rule that matches sets the token for that contact. If no rule matches, the token falls back to its \`default_value\`.
3. Substitutes tokens into \`body_template\` and \`subject_variants\` using a simple mustache-style syntax.

## Token and rule DSL

Tokens are referenced in templates as:
- \`{{first_name}}\`, \`{{last_name}}\`, \`{{email}}\`, \`{{job_title}}\`, \`{{seniority}}\`, \`{{department}}\`, \`{{contact_country}}\`
- \`{{company.name}}\`, \`{{company.domain}}\`, \`{{company.website}}\`, \`{{company.description}}\`, \`{{industry_iso}}\`, \`{{employee_count}}\`, \`{{hq_country}}\`, \`{{funding_stage}}\`
- \`{{custom.<key>}}\` — contact-level custom field from the enrichment spec
- \`{{account.custom.<key>}}\` — account-level custom field from the enrichment spec
- \`{{token.<key>}}\` — one of *your* named strategist tokens (dynamic, conditional)

Rule predicates (the \`when\` field):
- \`has(path)\` — path has a non-empty value
- \`eq(path, 'literal')\` — value equals literal (string compare, case-insensitive)
- \`contains(path, 'literal')\` — string or array contains literal (case-insensitive)
- \`in(path, 'a'|'b'|'c')\` — value is one of the pipe-separated literals
- \`truthy(path)\` — value is present and not false/0/""

\`path\` uses the same dotted syntax as tokens but without the \`{{}}\` (e.g. \`custom.recent_funding\`, \`account.custom.hiring_engineers\`, \`seniority\`).

## Your design process

1. Look at the enriched sample rows and the qualification goals. Decide: does this data support PVP (rich per-prospect signal), PQS (specific pain + triggers), or Eric (firmographic only)?
2. Justify the choice in \`framework_rationale\` (2–4 sentences; cite what you saw in the sample).
3. Decide \`sequence_length\` (bounded by the framework's max).
4. Design \`tokens\`: named variable slots the template will use. A token is either static (always the default) or dynamic (its value comes from rules).
5. Design \`personalization_rules\`: conditional rules that set tokens based on enriched data. Rules fire in array order; first match wins per token. Always leave the token's \`default_value\` as a safe fallback that works when no rule matches.
6. Write the \`sequence\`: each step has subject variants, a body template (using {{tokens}}), a CTA, and a stated step goal. The template's *static* parts stay constant across contacts; the personalized parts come via tokens.
7. Apply universal copy rules (see below). List which rules you applied in \`copy_rules_applied\` as a short audit trail.
8. \`field_mapping.primary\` lists the enriched field paths you actually used (e.g. \`custom.recent_funding\`, \`job_title\`). \`secondary\` lists fields you kept as fallbacks.

## Hard constraints

- Output must validate against the provided schema.
- Respect framework max sequence length (PVP: 3, PQS: 4, Eric: 4).
- Every \`{{token.<key>}}\` referenced in a template MUST exist in the \`tokens\` array.
- Every rule's \`token_key\` MUST match a token.
- At least one step must use at least one dynamic token (\`{{token.<key>}}\`) — that's the whole point of the strategy.
- Subjects are lowercase, 2–5 words, no punctuation.
- No em-dashes, no exclamation marks, no buzzwords. Use these as the \`copy_rules_applied\` entries when relevant.

${FRAMEWORK_BRIEF}`;

type StrategyInput = {
  campaignName: string;
  campaignType: string;
  audience: string;
  goals: Array<{ id: string; label: string }>;
  spec: EnrichmentSpec;
  sampleAccounts: Array<Record<string, unknown>>;
  sampleContacts: Array<Record<string, unknown>>;
};

function buildUserPrompt(input: StrategyInput): string {
  const goalLines = input.goals
    .map((g, i) => `${i + 1}. ${g.id} — ${g.label}`)
    .join("\n");

  const accountFieldLines = input.spec.account.custom_fields
    .map((f) => `  - account.custom.${f.key} (${f.type}) — ${f.title}`)
    .join("\n");
  const contactFieldLines = input.spec.contact.custom_fields
    .map((f) => `  - custom.${f.key} (${f.type}) — ${f.title}`)
    .join("\n");

  const sampleAccountsStr = JSON.stringify(
    input.sampleAccounts.slice(0, 6),
    null,
    2,
  );
  const sampleContactsStr = JSON.stringify(
    input.sampleContacts.slice(0, 8),
    null,
    2,
  );

  return `# Campaign

Name: ${input.campaignName}
Type: ${input.campaignType}

Audience:
${input.audience}

Ranked goals (most important first):
${goalLines}

# Enrichment spec

Summary: ${input.spec.summary}

Custom account fields:
${accountFieldLines || "  (none)"}

Custom contact fields:
${contactFieldLines || "  (none)"}

# Sample enriched data

Accounts (first ${Math.min(6, input.sampleAccounts.length)} of ${input.sampleAccounts.length}):
${sampleAccountsStr}

Contacts (first ${Math.min(8, input.sampleContacts.length)} of ${input.sampleContacts.length}):
${sampleContactsStr}

# Task

Produce the full email strategy. Base your framework choice on what the sample data actually contains, not on what it could contain. If most rows have sparse custom fields, prefer Eric. If they're rich with cross-referenceable signal, prefer PVP. If the campaign goals name a specific pain and the data has pain triggers, prefer PQS.`;
}

function validateTokenReferences(strategy: EmailStrategy): string | null {
  const tokenKeys = new Set(strategy.tokens.map((t) => t.key));
  for (const rule of strategy.personalization_rules) {
    if (!tokenKeys.has(rule.token_key)) {
      return `Rule ${rule.id} references unknown token ${rule.token_key}`;
    }
  }
  const tokenRefRe = /\{\{\s*token\.([a-z][a-z0-9_]*)\s*\}\}/g;
  for (const step of strategy.sequence) {
    const body = step.body_template;
    let match: RegExpExecArray | null;
    while ((match = tokenRefRe.exec(body)) !== null) {
      const key = match[1]!;
      if (!tokenKeys.has(key)) {
        return `Step ${step.step} references unknown token ${key}`;
      }
    }
  }
  if (strategy.sequence_length > FRAMEWORK_MAX_STEPS[strategy.framework]) {
    return `Sequence length ${strategy.sequence_length} exceeds max for ${strategy.framework}`;
  }
  if (strategy.sequence.length !== strategy.sequence_length) {
    return `sequence_length (${strategy.sequence_length}) does not match sequence array length (${strategy.sequence.length})`;
  }
  return null;
}

export async function generateEmailStrategy(
  input: StrategyInput,
): Promise<EmailStrategy> {
  try {
    const { output } = await generateText({
      model: MODEL_ID,
      system: SYSTEM_PROMPT,
      prompt: buildUserPrompt(input),
      output: Output.object({ schema: emailStrategySchema }),
      maxOutputTokens: 16000,
    });
    const err = validateTokenReferences(output);
    if (err) {
      throw new Error(`Strategist produced invalid output: ${err}`);
    }
    return output;
  } catch (err) {
    const anyErr = err as { text?: string; cause?: unknown; message?: string };
    console.error("[generateEmailStrategy] failed:", {
      message: anyErr.message,
      text: anyErr.text?.slice(0, 4000),
      cause: anyErr.cause,
    });
    throw err;
  }
}
