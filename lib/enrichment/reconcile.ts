// Merge AI + provider results into a resolved record + per-field provenance.
// Rules:
// - If both AI and provider return a value and they match → source = "both"
// - If both return a value and they differ → provider wins, source = "provider"
//   (third-party data is generally more authoritative than model memory)
// - If only one returned a value → that one wins, source reflects origin
// - If both are null → chosen is null, source = "none"

import type {
  AccountAiResult,
  ContactAiResult,
} from "@/lib/enrichment/ai-enrichment";
import type {
  ProviderAccountRecord,
  ProviderContactRecord,
} from "@/lib/enrichment/mock-provider";
import type { CustomField } from "@/lib/schema/enrichment-spec";

export type FieldProvenance = {
  chosen: unknown;
  source: "ai" | "provider" | "both" | "none";
  ai: unknown;
  provider: unknown;
};

export type ReconciledAccount = {
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
  provenance: Record<string, FieldProvenance>;
};

export type ReconciledContact = {
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown>;
  provenance: Record<string, FieldProvenance>;
};

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function reconcileField(ai: unknown, provider: unknown): FieldProvenance {
  const aiEmpty = isEmpty(ai);
  const providerEmpty = isEmpty(provider);
  if (aiEmpty && providerEmpty) {
    return { chosen: null, source: "none", ai: null, provider: null };
  }
  if (aiEmpty) {
    return { chosen: provider, source: "provider", ai: null, provider };
  }
  if (providerEmpty) {
    return { chosen: ai, source: "ai", ai, provider: null };
  }
  // Both present: normalize for comparison
  if (JSON.stringify(ai) === JSON.stringify(provider)) {
    return { chosen: provider, source: "both", ai, provider };
  }
  // Differ: provider wins.
  return { chosen: provider, source: "provider", ai, provider };
}

const ACCOUNT_STANDARD_KEYS = [
  "company_name",
  "company_linkedin",
  "company_domain",
  "company_website",
  "company_description",
  "industry_iso",
  "employee_count",
  "hq_country",
  "funding_stage",
] as const;

const CONTACT_STANDARD_KEYS = [
  "first_name",
  "last_name",
  "contact_linkedin",
  "job_title",
  "seniority",
  "department",
  "contact_country",
] as const;

export function reconcileAccount(
  ai: AccountAiResult,
  provider: ProviderAccountRecord | null,
  customFields: CustomField[],
): ReconciledAccount {
  const provenance: Record<string, FieldProvenance> = {};
  const standard: Record<string, unknown> = {};

  for (const key of ACCOUNT_STANDARD_KEYS) {
    const p = reconcileField(
      (ai as Record<string, unknown>)[key],
      provider ? (provider as Record<string, unknown>)[key] : null,
    );
    provenance[key] = p;
    standard[key] = p.chosen;
  }

  const customData: Record<string, unknown> = {};
  for (const field of customFields) {
    const p = reconcileField(
      ai.custom_data?.[field.key],
      provider?.custom_data?.[field.key],
    );
    provenance[field.key] = p;
    customData[field.key] = p.chosen;
  }

  return {
    company_name: standard.company_name as string | null,
    company_linkedin: standard.company_linkedin as string | null,
    company_domain: standard.company_domain as string | null,
    company_website: standard.company_website as string | null,
    company_description: standard.company_description as string | null,
    industry_iso: standard.industry_iso as string | null,
    employee_count: standard.employee_count as number | null,
    hq_country: standard.hq_country as string | null,
    funding_stage: standard.funding_stage as string | null,
    custom_data: customData,
    provenance,
  };
}

export function reconcileContact(
  ai: ContactAiResult,
  provider: ProviderContactRecord | null,
  customFields: CustomField[],
): ReconciledContact {
  const provenance: Record<string, FieldProvenance> = {};
  const standard: Record<string, unknown> = {};

  for (const key of CONTACT_STANDARD_KEYS) {
    const p = reconcileField(
      (ai as Record<string, unknown>)[key],
      provider ? (provider as Record<string, unknown>)[key] : null,
    );
    provenance[key] = p;
    standard[key] = p.chosen;
  }

  const customData: Record<string, unknown> = {};
  for (const field of customFields) {
    const p = reconcileField(
      ai.custom_data?.[field.key],
      provider?.custom_data?.[field.key],
    );
    provenance[field.key] = p;
    customData[field.key] = p.chosen;
  }

  return {
    first_name: standard.first_name as string | null,
    last_name: standard.last_name as string | null,
    contact_linkedin: standard.contact_linkedin as string | null,
    job_title: standard.job_title as string | null,
    seniority: standard.seniority as string | null,
    department: standard.department as string | null,
    contact_country: standard.contact_country as string | null,
    custom_data: customData,
    provenance,
  };
}
