// Hand-curated mock data for the sample CSV companies, with deterministic
// pseudo-data for any domain/email we haven't seen. Simulates a paid
// third-party enrichment provider (Clearbit-like) returning structured data.

import type { CustomField } from "@/lib/schema/enrichment-spec";

export type ProviderAccountRecord = {
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

export type ProviderContactRecord = {
  email: string;
  first_name: string | null;
  last_name: string | null;
  contact_linkedin: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  contact_country: string | null;
  custom_data: Record<string, unknown>;
};

const CURATED_ACCOUNTS: Record<string, ProviderAccountRecord> = {
  "mit.edu": {
    company_name: "Massachusetts Institute of Technology",
    company_linkedin: "https://www.linkedin.com/school/mit/",
    company_domain: "mit.edu",
    company_website: "https://www.mit.edu",
    company_description:
      "Private research university in Cambridge, Massachusetts focused on science, engineering, and technology.",
    industry_iso: "Higher Education",
    employee_count: 12000,
    hq_country: "United States",
    funding_stage: "Non-profit",
    custom_data: {
      tech_stack: ["AWS", "Kubernetes", "Python"],
      recent_news: "Announced new AI research initiative in March 2026.",
    },
  },
  "relatel.dk": {
    company_name: "Relatel",
    company_linkedin: "https://www.linkedin.com/company/relatel/",
    company_domain: "relatel.dk",
    company_website: "https://relatel.dk",
    company_description:
      "Danish B2B telecom operator offering cloud-based telephony and internet for SMBs.",
    industry_iso: "Telecommunications",
    employee_count: 140,
    hq_country: "Denmark",
    funding_stage: "Growth",
    custom_data: {
      tech_stack: ["AWS", "Node.js", "Salesforce"],
    },
  },
  "espressohouse.com": {
    company_name: "Espresso House",
    company_linkedin: "https://www.linkedin.com/company/espresso-house/",
    company_domain: "espressohouse.com",
    company_website: "https://espressohouse.com",
    company_description:
      "Nordic coffee shop chain with 500+ locations across Sweden, Norway, Finland, Denmark, and Germany.",
    industry_iso: "Food & Beverage",
    employee_count: 5200,
    hq_country: "Sweden",
    funding_stage: "Private",
    custom_data: {},
  },
  "visma.com": {
    company_name: "Visma",
    company_linkedin: "https://www.linkedin.com/company/visma/",
    company_domain: "visma.com",
    company_website: "https://www.visma.com",
    company_description:
      "Norwegian multinational software company delivering business software and IT services across the Nordics and Europe.",
    industry_iso: "Software",
    employee_count: 15000,
    hq_country: "Norway",
    funding_stage: "Private",
    custom_data: {
      tech_stack: [".NET", "Azure", "React"],
    },
  },
  "rismasystems.com": {
    company_name: "RISMA Systems",
    company_linkedin: "https://www.linkedin.com/company/risma-systems/",
    company_domain: "rismasystems.com",
    company_website: "https://rismasystems.com",
    company_description:
      "Danish SaaS platform for governance, risk, and compliance (GRC) management.",
    industry_iso: "Software",
    employee_count: 85,
    hq_country: "Denmark",
    funding_stage: "Series B",
    custom_data: {
      tech_stack: ["React", "Node.js", "AWS"],
    },
  },
  "flyingtiger.com": {
    company_name: "Flying Tiger Copenhagen",
    company_linkedin: "https://www.linkedin.com/company/flying-tiger-copenhagen/",
    company_domain: "flyingtiger.com",
    company_website: "https://flyingtiger.com",
    company_description:
      "Danish variety store chain with 900+ stores across 30 countries, known for affordable design-led homewares.",
    industry_iso: "Retail",
    employee_count: 7000,
    hq_country: "Denmark",
    funding_stage: "Private",
    custom_data: {},
  },
  "wilke.dk": {
    company_name: "Wilke",
    company_linkedin: "https://www.linkedin.com/company/wilke/",
    company_domain: "wilke.dk",
    company_website: "https://wilke.dk",
    company_description:
      "Danish market research and insights agency serving B2B and B2C clients across Europe.",
    industry_iso: "Market Research",
    employee_count: 60,
    hq_country: "Denmark",
    funding_stage: "Private",
    custom_data: {},
  },
  "neotalentconclusion.com": {
    company_name: "NeoTalent Conclusion",
    company_linkedin: "https://www.linkedin.com/company/neotalent-conclusion/",
    company_domain: "neotalentconclusion.com",
    company_website: "https://neotalentconclusion.com",
    company_description:
      "Portuguese IT talent and consulting firm, part of Conclusion group, specializing in software engineering.",
    industry_iso: "IT Services",
    employee_count: 1200,
    hq_country: "Portugal",
    funding_stage: "Private",
    custom_data: {
      tech_stack: ["Java", "Angular", "AWS"],
    },
  },
  "emma-sleep.com": {
    company_name: "Emma – The Sleep Company",
    company_linkedin: "https://www.linkedin.com/company/emma-the-sleep-company/",
    company_domain: "emma-sleep.com",
    company_website: "https://www.emma-sleep.com",
    company_description:
      "German D2C sleep brand selling mattresses, pillows, and bedding in 30+ countries.",
    industry_iso: "Consumer Goods",
    employee_count: 900,
    hq_country: "Germany",
    funding_stage: "Private",
    custom_data: {
      tech_stack: ["Shopify Plus", "GCP", "React"],
    },
  },
  "google.com": {
    company_name: "Google",
    company_linkedin: "https://www.linkedin.com/company/google/",
    company_domain: "google.com",
    company_website: "https://www.google.com",
    company_description:
      "American multinational technology company specializing in Internet-related services and products.",
    industry_iso: "Software",
    employee_count: 180000,
    hq_country: "United States",
    funding_stage: "Public",
    custom_data: {
      tech_stack: ["GCP", "Go", "Python", "Kubernetes"],
    },
  },
};

function deterministicHash(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = (h ^ input.charCodeAt(i)) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

function pickDeterministic<T>(seed: string, options: readonly T[]): T {
  const index = deterministicHash(seed) % options.length;
  return options[index]!;
}

const GENERIC_INDUSTRIES = [
  "Software",
  "Professional Services",
  "Manufacturing",
  "Healthcare",
  "Financial Services",
] as const;
const GENERIC_FUNDING = ["Seed", "Series A", "Series B", "Private", "Public"] as const;
const GENERIC_COUNTRIES = [
  "United States",
  "United Kingdom",
  "Germany",
  "Denmark",
  "Sweden",
] as const;

function fallbackAccount(domain: string): ProviderAccountRecord {
  const name = domain
    .split(".")[0]!
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const employeeBuckets = [25, 75, 180, 450, 900, 2000];
  return {
    company_name: name,
    company_linkedin: null,
    company_domain: domain,
    company_website: `https://${domain}`,
    company_description: null,
    industry_iso: pickDeterministic(`${domain}:industry`, GENERIC_INDUSTRIES),
    employee_count: pickDeterministic(`${domain}:emp`, employeeBuckets),
    hq_country: pickDeterministic(`${domain}:country`, GENERIC_COUNTRIES),
    funding_stage: pickDeterministic(`${domain}:funding`, GENERIC_FUNDING),
    custom_data: {},
  };
}

export function providerLookupAccount(
  domain: string | null,
  customFields: CustomField[],
): ProviderAccountRecord | null {
  if (!domain) return null;
  const base = CURATED_ACCOUNTS[domain.toLowerCase()] ?? fallbackAccount(domain.toLowerCase());
  // Trim custom_data to only the keys the spec asks for; provider doesn't
  // know about fields that weren't requested.
  const filtered: Record<string, unknown> = {};
  for (const field of customFields) {
    if (field.key in base.custom_data) {
      filtered[field.key] = base.custom_data[field.key];
    }
  }
  return { ...base, custom_data: filtered };
}

const DEPARTMENTS = ["Engineering", "Marketing", "Sales", "Operations", "Product"] as const;
const SENIORITIES = ["IC", "Manager", "Director", "VP", "C-Level"] as const;

export function providerLookupContact(
  email: string,
  seed: {
    first_name?: string | null;
    last_name?: string | null;
    job_title?: string | null;
    contact_linkedin?: string | null;
  },
  customFields: CustomField[],
): ProviderContactRecord {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[.\-_]/).filter(Boolean);
  const first =
    seed.first_name ||
    (parts[0] ? parts[0][0]!.toUpperCase() + parts[0]!.slice(1) : null);
  const last =
    seed.last_name ||
    (parts[1] ? parts[1][0]!.toUpperCase() + parts[1]!.slice(1) : null);
  const linkedin =
    seed.contact_linkedin ||
    (first && last
      ? `https://www.linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}-${(
          deterministicHash(email) % 9000
        ) + 1000}/`
      : null);

  const filtered: Record<string, unknown> = {};
  for (const field of customFields) {
    // Provider returns nothing for unknown custom fields — AI has to fill them.
    void field;
  }

  return {
    email,
    first_name: first,
    last_name: last,
    contact_linkedin: linkedin,
    job_title: seed.job_title ?? null,
    seniority: pickDeterministic(`${email}:seniority`, SENIORITIES),
    department: pickDeterministic(`${email}:department`, DEPARTMENTS),
    contact_country: null,
    custom_data: filtered,
  };
}
