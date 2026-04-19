import { z } from "zod";

export const FIELD_TYPES = [
  "string",
  "number",
  "boolean",
  "enum",
  "url",
  "date",
  "array",
] as const;

export const ENRICHMENT_SOURCES = [
  "company_website",
  "linkedin_company",
  "linkedin_profile",
  "linkedin_posts",
  "github",
  "news_search",
  "job_posts",
  "web_search",
  "crm_existing",
] as const;

export const ENRICHMENT_SOURCE_LABEL: Record<
  (typeof ENRICHMENT_SOURCES)[number],
  string
> = {
  company_website: "Company website",
  linkedin_company: "LinkedIn (company)",
  linkedin_profile: "LinkedIn (profile)",
  linkedin_posts: "LinkedIn (posts)",
  github: "GitHub",
  news_search: "News search",
  job_posts: "Job posts",
  web_search: "Web search",
  crm_existing: "CRM (existing)",
};

const customFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, "snake_case identifier"),
  title: z.string().min(2).max(60),
  description: z.string().min(10).max(240),
  type: z.enum(FIELD_TYPES),
  enum_values: z.array(z.string()).optional(),
  enrichment: z.object({
    primary_source: z.enum(ENRICHMENT_SOURCES),
    fallback_source: z.enum(ENRICHMENT_SOURCES).optional(),
    query_template: z.string().min(5).max(200),
    reasoning: z.string().min(10).max(240),
  }),
});

const levelSchema = z.object({
  custom_fields: z.array(customFieldSchema).max(5),
});

export const enrichmentSpecSchema = z.object({
  summary: z.string().min(20).max(600),
  account: levelSchema,
  contact: levelSchema,
  qualification_rubric: z.array(
    z.object({
      goal_id: z.string(),
      signals: z.array(z.string()).min(1).max(6),
      disqualifiers: z.array(z.string()).max(6),
    }),
  ),
  personalization_hooks: z
    .array(
      z.object({
        title: z.string().min(3).max(60),
        description: z.string().min(10).max(240),
        uses_fields: z.array(z.string()).min(1),
      }),
    )
    .max(5),
});

export type EnrichmentSpec = z.infer<typeof enrichmentSpecSchema>;
export type CustomField = z.infer<typeof customFieldSchema>;
