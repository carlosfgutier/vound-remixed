import { z } from "zod";

// Three cold-email frameworks the strategist can pick from.
// PVP and Eric have hard max sequence lengths; PQS is ~4.
export const EMAIL_FRAMEWORKS = ["PVP", "PQS", "Eric"] as const;
export type EmailFramework = (typeof EMAIL_FRAMEWORKS)[number];

export const FRAMEWORK_MAX_STEPS: Record<EmailFramework, number> = {
  PVP: 3,
  PQS: 4,
  Eric: 4,
};

// A named token: either a static fill (e.g. opener), or conditional by rules.
// `value` is the default when no rule matches (or when this is a simple static token).
const tokenSchema = z.object({
  key: z.string(),
  description: z.string(),
  default_value: z.string(),
});

// A conditional rule: when a predicate matches an enriched row, use this value
// for the target token. Predicates are simple and evaluated server-side in the
// renderer — see lib/email/render-template.ts.
const ruleSchema = z.object({
  id: z.string(),
  token_key: z.string(),
  when: z
    .string()
    .describe(
      "Predicate DSL: has(path) | eq(path, 'lit') | contains(path, 'lit') | in(path, 'a'|'b') | truthy(path). path = standard key, 'custom.<key>', 'account.<key>' or 'account.custom.<key>'.",
    ),
  value: z.string(),
  rationale: z.string(),
});

const stepSchema = z.object({
  step: z.number().int(),
  day_offset: z.number().int(),
  is_thread: z.boolean(),
  subject_variants: z.array(z.string()).min(1).max(3),
  body_template: z
    .string()
    .describe(
      "Body with {{token}} placeholders. Tokens can reference: {{first_name}}, {{company.name}}, {{custom.<key>}}, {{account.custom.<key>}}, {{token.<key>}} (named strategist tokens).",
    ),
  cta: z.string(),
  goal: z.string(),
});

export const emailStrategySchema = z.object({
  framework: z.enum(EMAIL_FRAMEWORKS),
  framework_rationale: z.string(),
  sequence_length: z.number().int(),
  field_mapping: z.object({
    primary: z.array(z.string()),
    secondary: z.array(z.string()),
  }),
  tokens: z.array(tokenSchema).min(1),
  personalization_rules: z.array(ruleSchema),
  sequence: z.array(stepSchema).min(1).max(5),
  copy_rules_applied: z.array(z.string()),
});

export type EmailStrategy = z.infer<typeof emailStrategySchema>;
export type EmailToken = z.infer<typeof tokenSchema>;
export type EmailRule = z.infer<typeof ruleSchema>;
export type EmailStep = z.infer<typeof stepSchema>;
