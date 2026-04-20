import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  ENRICHMENT_SOURCE_LABEL,
  type CustomField,
  type EnrichmentSpec,
} from "@/lib/schema/enrichment-spec";

const MODEL_ID = "anthropic/claude-sonnet-4.6";

const ACCOUNT_SYSTEM_PROMPT = `You are an AI researcher enriching a B2B account record for an outbound sales campaign. You will receive: (1) what we already know about the company, (2) the campaign context, (3) per-field research instructions (primary source, research query, and why the field matters), and (4) qualification signals the GTM team uses to judge fit.

Rules:
- Return ONLY the fields listed in the schema.
- Use null when you don't know with confidence. Never fabricate URLs, funding stages, or numeric counts.
- Respect each custom field's type (string / number / boolean / enum / url / date / array). For enums, pick exactly one of the allowed values or null.
- Favor values you can justify from the field's primary/fallback source. The query template is a hint at what a human researcher would search for.
- For \`array\` fields, return a small, concrete list (typically 2-5 items). No duplicates.`;

const CONTACT_SYSTEM_PROMPT = `You are an AI researcher enriching a B2B contact record for an outbound sales campaign. You will receive: (1) what we already know about the contact and their company, (2) the campaign context, and (3) per-field research instructions.

Rules:
- Return ONLY the fields listed in the schema.
- Use null when unknown. Never fabricate URLs, titles, or personal details.
- Respect each custom field's type. For enums, pick exactly one allowed value or null.
- If the contact's name or LinkedIn is already known, keep the known value unless you have strong evidence of a correction.
- For \`seniority\` use values like: IC, Manager, Director, VP, C-Level. For \`department\` use a single functional area (Engineering, Product, Marketing, Sales, Operations, Finance, HR, Other).`;

function customFieldToZod(field: CustomField): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (field.type) {
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "enum":
      if (field.enum_values && field.enum_values.length > 0) {
        base = z.enum(field.enum_values as [string, ...string[]]);
      } else {
        base = z.string();
      }
      break;
    case "url":
      base = z.string();
      break;
    case "date":
      base = z.string();
      break;
    case "array":
      base = z.array(z.string());
      break;
    case "string":
    default:
      base = z.string();
      break;
  }
  return base.nullable();
}

function customFieldsToSchema(fields: CustomField[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    shape[field.key] = customFieldToZod(field);
  }
  return z.object(shape);
}

export type AccountAiResult = {
  company_name: string | null;
  company_linkedin: string | null;
  company_domain: string | null;
  company_website: string | null;
  company_description: string | null;
  industry_iso: string | null;
  employee_count: number | null;
  hq_country: string | null;
  funding_stage: string | null;
  custom_data: Record<string, unknown>;
};

export type ContactAiResult = {
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown>;
};

const ACCOUNT_STANDARD_SCHEMA = z.object({
  company_name: z.string().nullable(),
  company_linkedin: z.string().nullable(),
  company_domain: z.string().nullable(),
  company_website: z.string().nullable(),
  company_description: z.string().nullable(),
  industry_iso: z.string().nullable(),
  employee_count: z.number().nullable(),
  hq_country: z.string().nullable(),
  funding_stage: z.string().nullable(),
});

const CONTACT_STANDARD_SCHEMA = z.object({
  first_name: z.string().nullable(),
  last_name: z.string().nullable(),
  contact_linkedin: z.string().nullable(),
  job_title: z.string().nullable(),
  seniority: z.string().nullable(),
  department: z.string().nullable(),
  contact_country: z.string().nullable(),
});

function formatCustomField(f: CustomField): string {
  const typeSuffix = f.enum_values
    ? `, one of: ${f.enum_values.join(" | ")}`
    : "";
  const primary = ENRICHMENT_SOURCE_LABEL[f.enrichment.primary_source];
  const fallback = f.enrichment.fallback_source
    ? ENRICHMENT_SOURCE_LABEL[f.enrichment.fallback_source]
    : null;
  const sources = fallback ? `${primary}, fallback: ${fallback}` : primary;
  return [
    `- ${f.key} (${f.type}${typeSuffix})`,
    `    what: ${f.description}`,
    `    why: ${f.enrichment.reasoning}`,
    `    source: ${sources}`,
    `    research query: ${f.enrichment.query_template}`,
  ].join("\n");
}

function formatRubric(spec: EnrichmentSpec): string {
  if (spec.qualification_rubric.length === 0) return "(none)";
  return spec.qualification_rubric
    .map((r, i) => {
      const signals = r.signals.map((s) => `    + ${s}`).join("\n");
      const disq =
        r.disqualifiers.length > 0
          ? "\n" + r.disqualifiers.map((d) => `    - ${d}`).join("\n")
          : "";
      return `Goal ${i + 1} (${r.goal_id}):\n${signals}${disq}`;
    })
    .join("\n\n");
}

export async function aiEnrichAccount(
  known: {
    company_name: string | null;
    company_domain: string | null;
    company_linkedin: string | null;
  },
  spec: EnrichmentSpec,
): Promise<AccountAiResult> {
  const customFields = spec.account.custom_fields;
  const customSchema = customFieldsToSchema(customFields);
  const fullSchema = ACCOUNT_STANDARD_SCHEMA.extend({
    custom_data: customSchema,
  });

  const fieldLines =
    customFields.length > 0
      ? customFields.map(formatCustomField).join("\n\n")
      : "(none)";

  const prompt = `# Known about this account
- Company name: ${known.company_name ?? "(unknown)"}
- Company domain: ${known.company_domain ?? "(unknown)"}
- Company LinkedIn: ${known.company_linkedin ?? "(unknown)"}

# Campaign context
${spec.summary}

# Qualification signals (what GTM cares about)
${formatRubric(spec)}

# Task
Fill in the standard fields:
company_name, company_linkedin, company_domain, company_website, company_description, industry_iso, employee_count, hq_country, funding_stage.

Then fill in custom_data with these keys. Each field has a research hint (what / why / source / query):

${fieldLines}

Return null for any field you cannot determine with confidence. Do not invent values.`;

  const { output } = await generateText({
    model: MODEL_ID,
    system: ACCOUNT_SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: fullSchema }),
    maxOutputTokens: 4000,
  });

  return output as AccountAiResult;
}

export async function aiEnrichContact(
  known: {
    email: string;
    first_name: string | null;
    last_name: string | null;
    contact_linkedin: string | null;
    job_title: string | null;
    company_name: string | null;
    company_domain: string | null;
  },
  spec: EnrichmentSpec,
): Promise<ContactAiResult> {
  const customFields = spec.contact.custom_fields;
  const customSchema = customFieldsToSchema(customFields);
  const fullSchema = CONTACT_STANDARD_SCHEMA.extend({
    custom_data: customSchema,
  });

  const fieldLines =
    customFields.length > 0
      ? customFields.map(formatCustomField).join("\n\n")
      : "(none)";

  const prompt = `# Known about this contact
- Email: ${known.email}
- First name: ${known.first_name ?? "(unknown)"}
- Last name: ${known.last_name ?? "(unknown)"}
- LinkedIn: ${known.contact_linkedin ?? "(unknown)"}
- Job title: ${known.job_title ?? "(unknown)"}
- Company: ${known.company_name ?? "(unknown)"} (${known.company_domain ?? "unknown domain"})

# Campaign context
${spec.summary}

# Qualification signals (what GTM cares about)
${formatRubric(spec)}

# Task
Fill in the standard fields:
first_name, last_name, contact_linkedin, job_title, seniority, department, contact_country.

Then fill in custom_data with these keys. Each field has a research hint (what / why / source / query):

${fieldLines}

Return null for any field you cannot determine with confidence. Do not invent values.`;

  const { output } = await generateText({
    model: MODEL_ID,
    system: CONTACT_SYSTEM_PROMPT,
    prompt,
    output: Output.object({ schema: fullSchema }),
    maxOutputTokens: 3000,
  });

  return output as ContactAiResult;
}
