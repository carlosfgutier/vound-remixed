import type { FIELD_TYPES } from "./schema/enrichment-spec";

type StandardFieldType = (typeof FIELD_TYPES)[number];

export type StandardField = {
  key: string;
  title: string;
  type: StandardFieldType;
};

export const STANDARD_ACCOUNT_FIELDS: readonly StandardField[] = [
  { key: "company_name", title: "Company Name", type: "string" },
  { key: "company_linkedin", title: "Company LinkedIn URL", type: "url" },
  { key: "company_domain", title: "Company Domain", type: "string" },
  { key: "company_website", title: "Company Website", type: "url" },
  { key: "company_description", title: "Company Description", type: "string" },
  { key: "industry_iso", title: "Industry (ISO)", type: "string" },
  { key: "employee_count", title: "Employee Count", type: "number" },
  { key: "hq_country", title: "HQ Country", type: "string" },
  { key: "funding_stage", title: "Funding Stage", type: "enum" },
] as const;

export const STANDARD_CONTACT_FIELDS: readonly StandardField[] = [
  { key: "email", title: "Email", type: "string" },
  { key: "first_name", title: "First Name", type: "string" },
  { key: "last_name", title: "Last Name", type: "string" },
  { key: "contact_linkedin", title: "Contact LinkedIn URL", type: "url" },
  { key: "job_title", title: "Job Title", type: "string" },
  { key: "seniority", title: "Seniority", type: "enum" },
  { key: "department", title: "Department", type: "enum" },
  { key: "contact_country", title: "Contact Country", type: "string" },
] as const;
