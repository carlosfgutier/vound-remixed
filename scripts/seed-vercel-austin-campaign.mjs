// Seed a realistic mock campaign:
// Vercel's post-event follow-up to attendees of a recruiting happy hour
// at Hangar Bar in Austin (panel with CTO + execs). Goal: book demos
// of Vercel Workflows, which Vercel just launched.
//
// Seeds 5 accounts + 10 contacts (2 per account), all fully enriched,
// plus a hand-crafted EnrichmentSpec and EmailStrategy so the campaign
// lands straight on /preview with real data.
//
// Usage:
//   node --env-file=.env.local scripts/seed-vercel-austin-campaign.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) throw new Error("Missing SUPABASE_URL");
if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Campaign brief
// ---------------------------------------------------------------------------

const CAMPAIGN_NAME = "Hangar Bar follow-up — Vercel Workflows demos";

const CAMPAIGN_TYPE =
  "Post-event follow-up to attendees of Vercel's Austin recruiting happy hour at Hangar Bar. The panel included the Vercel CTO and other execs. We want to introduce Vercel Workflows (just launched) and offer a 30-minute demo.";

const AUDIENCE =
  "Senior engineers, engineering managers, and platform/devrel leaders at Austin-area tech companies who attended the Hangar Bar happy hour. They already know the Vercel brand and met our execs in person.";

const GOALS = [
  { id: "demo" },
  { id: "book_call" },
  { id: "reengage" },
];

const PROVIDERS = ["clearbit", "linkedin", "zoominfo"];

// ---------------------------------------------------------------------------
// Enrichment spec (hand-crafted to mirror what the AI would produce)
// ---------------------------------------------------------------------------

const ENRICHMENT_SPEC = {
  summary:
    "Warm follow-up to Austin happy-hour attendees. High signal density — we know they self-selected to meet Vercel execs, so we can lead with panel-referenced personalization and pitch Vercel Workflows tailored to each company's platform stack.",
  account: {
    custom_fields: [
      {
        key: "platform_stack_signal",
        title: "Platform stack signal",
        description:
          "Evidence of Next.js, serverless, or durable-execution adoption at the company (job posts, engineering blog, GitHub).",
        type: "string",
        enrichment: {
          primary_source: "job_posts",
          fallback_source: "github",
          query_template:
            "{{company.company_name}} Next.js serverless platform engineer",
          reasoning:
            "Surfaces whether the company already leans into Vercel-friendly stacks, which tightens the Workflows pitch.",
        },
      },
      {
        key: "workflow_use_case",
        title: "Likely workflow use case",
        description:
          "One-sentence guess at the durable-workflow problem this company is most likely to be solving (payments, onboarding, ETL, agents, etc).",
        type: "string",
        enrichment: {
          primary_source: "company_website",
          fallback_source: "web_search",
          query_template: "{{company.company_name}} engineering blog workflow",
          reasoning:
            "Lets us tie Vercel Workflows to a concrete, recognizable problem in their domain rather than a generic pitch.",
        },
      },
      {
        key: "recent_engineering_signal",
        title: "Recent engineering signal",
        description:
          "A public signal from the last 90 days — launch, hire, blog post, or talk — that we can reference as context.",
        type: "string",
        enrichment: {
          primary_source: "news_search",
          fallback_source: "linkedin_posts",
          query_template: "{{company.company_name}} engineering launch 2026",
          reasoning:
            "Gives email 2 a fresh hook independent of the event memory.",
        },
      },
    ],
  },
  contact: {
    custom_fields: [
      {
        key: "event_memory",
        title: "Event memory",
        description:
          "A plausible moment from the Hangar Bar happy hour tied to this specific person (question they asked, topic they gravitated to, person they spoke with).",
        type: "string",
        enrichment: {
          primary_source: "crm_existing",
          fallback_source: "linkedin_profile",
          query_template: "{{first_name}} {{last_name}} {{company.company_name}} panel discussion",
          reasoning:
            "This is the single highest-leverage token — it proves the email is not a mass blast.",
        },
      },
      {
        key: "role_pain",
        title: "Role-specific pain",
        description:
          "The durable-execution pain most relevant to this person's role (reliability, observability, retries, long-running jobs).",
        type: "string",
        enrichment: {
          primary_source: "linkedin_profile",
          fallback_source: "web_search",
          query_template:
            "{{job_title}} {{company.company_name}} platform reliability",
          reasoning:
            "Aligns the Workflows value prop to the concrete pain they own day-to-day.",
        },
      },
    ],
  },
  qualification_rubric: [
    {
      goal_id: "demo",
      signals: [
        "Attended the Hangar Bar happy hour",
        "Works on platform, infra, or developer experience",
        "Company uses Next.js, AWS Lambda, or similar serverless stack",
        "Seniority: manager+ or senior IC who can influence tooling",
      ],
      disqualifiers: [
        "Non-engineering role (sales, marketing, recruiting)",
        "Company is a direct Vercel competitor",
      ],
    },
    {
      goal_id: "book_call",
      signals: [
        "Actively hiring platform / DX engineers",
        "Public evidence of workflow / orchestration pain (Airflow, Step Functions, Temporal, etc)",
      ],
      disqualifiers: ["Already a Vercel Enterprise customer with workflows scope"],
    },
  ],
  personalization_hooks: [
    {
      title: "Event-referenced opener",
      description:
        "Opens email 1 with a specific moment tied to what this person actually engaged with at the event.",
      uses_fields: ["event_memory", "first_name"],
    },
    {
      title: "Stack-matched workflow example",
      description:
        "Picks a workflow use case that matches the company's stack signal.",
      uses_fields: ["platform_stack_signal", "workflow_use_case"],
    },
    {
      title: "Role-pain bridge",
      description:
        "Bridges the workflow pitch into the recipient's role-specific pain.",
      uses_fields: ["role_pain"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Accounts (5 realistic Austin tech companies)
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  {
    company_name: "Indeed",
    company_domain: "indeed.com",
    company_website: "https://www.indeed.com",
    company_linkedin: "https://www.linkedin.com/company/indeed-com",
    company_description:
      "Global hiring platform (part of Recruit Holdings). Austin HQ. Operates at massive scale — millions of job seekers and listings, heavy personalization, ATS integrations.",
    industry_iso: "Internet",
    employee_count: 14000,
    hq_country: "United States",
    funding_stage: "Public subsidiary",
    summary:
      "Indeed is one of Austin's largest tech employers and runs the world's busiest hiring marketplace. Their platform team owns thousands of long-running jobs — candidate pipelines, ATS syncs, compliance sweeps — where durable execution and retry semantics matter more than anywhere on the marketing site.",
    angle:
      "Vercel Workflows directly attacks the class of 'must-run-to-completion' background jobs that Indeed's ATS integrations and candidate pipelines depend on today — typically running on homegrown job queues or Step Functions.",
    insights: [
      "Runs one of the largest job-posting and candidate-matching systems in the world; background orchestration is core to the product, not auxiliary",
      "Public engineering blog has repeatedly discussed workflow reliability and idempotency challenges at scale",
      "Already uses React + Next.js-friendly patterns on the job-seeker front-end, so the Vercel ecosystem is familiar",
    ],
    custom_data: {
      platform_stack_signal:
        "React + Next.js on job-seeker surfaces, internal job-orchestration on AWS (Step Functions + SQS per job posts)",
      workflow_use_case:
        "Long-running candidate pipeline syncs between ATS providers and the Indeed index",
      recent_engineering_signal:
        "February 2026 engineering post on reducing duplicate job-notification emails during partial retries",
    },
  },
  {
    company_name: "Bumble",
    company_domain: "bumble.com",
    company_website: "https://bumble.com",
    company_linkedin: "https://www.linkedin.com/company/bumble",
    company_description:
      "Women-first social connections app (Bumble Date, Bumble BFF, Bumble Bizz). Austin-headquartered. Heavy consumer mobile + web product with growth-engineering culture.",
    industry_iso: "Internet",
    employee_count: 1200,
    hq_country: "United States",
    funding_stage: "Public",
    summary:
      "Bumble's engineering org is split between mobile app and a growing web surface. Growth and lifecycle engineering run a lot of long-lived orchestration — onboarding drips, subscription recovery, moderation escalations — that today lives in a mix of Airflow and internal services.",
    angle:
      "Bumble's lifecycle and growth engineering teams run user-journey orchestrations that break cleanly into the Vercel Workflows shape: durable steps, long waits, external webhooks. That's a direct fit for the audience we met at the panel.",
    insights: [
      "Austin HQ with a mid-sized platform team; easier to introduce tooling without a multi-quarter procurement slog",
      "Aggressive growth-experimentation culture — new tools that shorten experiment cycles get real internal traction",
      "Web surface is being rebuilt, which is exactly the window where new runtime choices actually land",
    ],
    custom_data: {
      platform_stack_signal:
        "Web rebuild on Next.js, mobile on native, growth infra on Airflow + Kafka",
      workflow_use_case:
        "Lifecycle / re-engagement sequences and subscription-recovery orchestration",
      recent_engineering_signal:
        "Bumble web team talks at ATX React meetup in March about replatforming to Next.js App Router",
    },
  },
  {
    company_name: "Atlassian",
    company_domain: "atlassian.com",
    company_website: "https://www.atlassian.com",
    company_linkedin: "https://www.linkedin.com/company/atlassian",
    company_description:
      "Team-collaboration software (Jira, Confluence, Trello, Bitbucket). Publicly traded, HQ in Sydney but large Austin engineering office focused on platform and DX.",
    industry_iso: "Software",
    employee_count: 12000,
    hq_country: "Australia",
    funding_stage: "Public",
    summary:
      "Atlassian's Austin office is disproportionately platform- and DX-focused — the people who would send engineers to a Vercel happy hour are exactly the people rebuilding internal developer platforms. They operate on long-running, multi-tenant orchestrations.",
    angle:
      "Atlassian's internal 'Compass' and developer-platform teams are productizing durable workflows internally. Vercel Workflows is a real option for the long tail of platform jobs that don't justify their home-built orchestrator.",
    insights: [
      "Austin office is the platform-engineering hub for the US — senior audience with direct influence on tooling",
      "Published several engineering posts on migrating from cron + queues to durable-execution patterns",
      "Heavy existing investment in internal DX tooling — they will evaluate Workflows against Temporal, not against raw Lambda",
    ],
    custom_data: {
      platform_stack_signal:
        "React + TypeScript on admin surfaces; internal orchestration blend of Temporal + bespoke workers",
      workflow_use_case:
        "Long-lived tenant migrations and automation rules across Jira / Confluence",
      recent_engineering_signal:
        "January 2026 blog on replacing a homegrown retry harness with durable execution primitives",
    },
  },
  {
    company_name: "Cloudflare",
    company_domain: "cloudflare.com",
    company_website: "https://www.cloudflare.com",
    company_linkedin: "https://www.linkedin.com/company/cloudflare",
    company_description:
      "Global edge network / security / developer platform. Publicly traded. Austin office is a growing engineering hub, particularly on Workers and developer platform.",
    industry_iso: "Internet",
    employee_count: 3700,
    hq_country: "United States",
    funding_stage: "Public",
    summary:
      "Cloudflare is the most interesting account of the five — overlap in developer-platform audience, clear competitive context, and an Austin office that's actively hiring on Workers + Durable Objects. Attendees who came to the Vercel panel from Cloudflare are self-declared multi-tool evaluators.",
    angle:
      "The Cloudflare attendees know the durable-execution space cold. The play is not 'teach them about Workflows' — it's 'show them the DX delta vs Durable Objects + Workflows for specific app shapes.' Honest comparative framing will land better than any buzzword pitch.",
    insights: [
      "Direct developer-platform peer / competitor — attendees are in-market evaluators by definition",
      "Austin engineering office expanding quickly; recent hires in developer-relations and platform",
      "Cloudflare Workflows GA'd recently — they will test us on DX parity, pricing, and cold-start behavior",
    ],
    custom_data: {
      platform_stack_signal:
        "Workers + Durable Objects; public Workflows product; Next.js on marketing + dashboard",
      workflow_use_case:
        "DX / devrel comparative evaluation of Vercel Workflows against their own Workflows product",
      recent_engineering_signal:
        "March 2026 Developer Week talks on Workflows patterns — they are actively evangelizing this category",
    },
  },
  {
    company_name: "H-E-B Digital",
    company_domain: "heb.com",
    company_website: "https://www.heb.com",
    company_linkedin: "https://www.linkedin.com/company/heb",
    company_description:
      "Digital arm of H-E-B, Texas's dominant grocery chain. San Antonio / Austin. Owns heb.com, delivery/curbside, and internal retail tech.",
    industry_iso: "Retail",
    employee_count: 150000,
    hq_country: "United States",
    funding_stage: "Private",
    summary:
      "H-E-B Digital punches far above its weight — their engineering org rebuilt heb.com, curbside, and delivery on a modern stack over the last four years. Austin team is small but quality-dense, and they are known buyers of best-in-class vendor tooling.",
    angle:
      "Grocery fulfillment is a textbook long-running-workflow domain: order placed → picking → substitution → handoff → delivery, with SLAs and retries at every edge. Vercel Workflows is an obvious fit for the fulfillment orchestration this team owns.",
    insights: [
      "Local Austin/San Antonio engineering talent market — they value in-person relationships, which is exactly what the Hangar Bar event created",
      "Rebuilt heb.com on Next.js and have spoken publicly about the migration",
      "Procurement friendlier to proven SaaS with usage-based pricing than to greenfield internal builds",
    ],
    custom_data: {
      platform_stack_signal:
        "Next.js on heb.com; Node + Go microservices for fulfillment; managed Kafka",
      workflow_use_case:
        "Order-to-delivery fulfillment orchestration with substitution and customer-notification steps",
      recent_engineering_signal:
        "Recent senior-hire announcements in fulfillment engineering and DX",
    },
  },
];

// ---------------------------------------------------------------------------
// Contacts (10 total — 2 per account)
// ---------------------------------------------------------------------------

const CONTACTS = [
  // Indeed
  {
    account_domain: "indeed.com",
    email: "priya.raman@indeed.com",
    first_name: "Priya",
    last_name: "Raman",
    contact_linkedin: "https://www.linkedin.com/in/priya-raman-indeed",
    job_title: "VP, Platform Engineering",
    seniority: "VP",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Stayed after the panel to ask our CTO how Workflows handles partial-failure replays vs. Step Functions",
      role_pain:
        "Owns a platform where background-job reliability is visible to every PM in the company",
    },
  },
  {
    account_domain: "indeed.com",
    email: "marcus.chen@indeed.com",
    first_name: "Marcus",
    last_name: "Chen",
    contact_linkedin: "https://www.linkedin.com/in/marcus-chen-eng",
    job_title: "Staff Software Engineer, ATS Integrations",
    seniority: "Staff",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Talked at the bar about how their ATS sync pipelines duplicate notifications when retries land mid-step",
      role_pain:
        "Idempotency and exactly-once semantics across third-party ATS webhooks",
    },
  },
  // Bumble
  {
    account_domain: "bumble.com",
    email: "sasha.morales@bumble.com",
    first_name: "Sasha",
    last_name: "Morales",
    contact_linkedin: "https://www.linkedin.com/in/sasha-morales",
    job_title: "Head of Web Engineering",
    seniority: "Head",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Came with the web-rebuild team and asked about Next.js App Router patterns with server actions + workflows",
      role_pain:
        "Shipping a platform replatform without losing velocity on growth experiments",
    },
  },
  {
    account_domain: "bumble.com",
    email: "tomas.rivera@bumble.com",
    first_name: "Tomas",
    last_name: "Rivera",
    contact_linkedin: "https://www.linkedin.com/in/tomas-rivera-dev",
    job_title: "Senior Engineer, Growth",
    seniority: "Senior",
    department: "Growth",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Asked the panel specifically about running A/B experiments inside a durable workflow vs. in an experimentation service",
      role_pain:
        "Long-lived lifecycle experiments that require durable waits and branching logic",
    },
  },
  // Atlassian
  {
    account_domain: "atlassian.com",
    email: "ellen.park@atlassian.com",
    first_name: "Ellen",
    last_name: "Park",
    contact_linkedin: "https://www.linkedin.com/in/ellen-park-em",
    job_title: "Engineering Manager, Developer Platform",
    seniority: "Manager",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Introduced herself as 'the person you want to convince' and asked for a deep-dive on replay semantics",
      role_pain:
        "Evaluating Workflows against an entrenched internal orchestrator — needs concrete DX wins, not slogans",
    },
  },
  {
    account_domain: "atlassian.com",
    email: "dev.kapoor@atlassian.com",
    first_name: "Dev",
    last_name: "Kapoor",
    contact_linkedin: "https://www.linkedin.com/in/dev-kapoor",
    job_title: "Principal Engineer, Platform",
    seniority: "Principal",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Took notes during the 'durable vs. cron' section and cornered our DX lead about versioning strategies",
      role_pain:
        "Versioning long-running workflows without breaking in-flight tenants",
    },
  },
  // Cloudflare
  {
    account_domain: "cloudflare.com",
    email: "jordan.nakamura@cloudflare.com",
    first_name: "Jordan",
    last_name: "Nakamura",
    contact_linkedin: "https://www.linkedin.com/in/jordan-nakamura",
    job_title: "Director, Developer Relations",
    seniority: "Director",
    department: "Developer Relations",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Was openly comparing Vercel Workflows and Cloudflare Workflows out loud at the bar; engaged the whole way",
      role_pain:
        "Needs a defensible, honest point of view on where each platform wins for external talks",
    },
  },
  {
    account_domain: "cloudflare.com",
    email: "nadia.almasri@cloudflare.com",
    first_name: "Nadia",
    last_name: "Almasri",
    contact_linkedin: "https://www.linkedin.com/in/nadia-almasri",
    job_title: "Senior Product Engineer, Workers",
    seniority: "Senior",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Asked the sharpest technical question of the night — about cold-start amortization on durable resumption",
      role_pain:
        "Cold starts and per-step latency in durable-execution runtimes",
    },
  },
  // H-E-B
  {
    account_domain: "heb.com",
    email: "rachel.okonkwo@heb.com",
    first_name: "Rachel",
    last_name: "Okonkwo",
    contact_linkedin: "https://www.linkedin.com/in/rachel-okonkwo",
    job_title: "Director of Engineering, Fulfillment",
    seniority: "Director",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Mentioned they had just finished a week of substitution-logic bugs and wanted to see how Workflows models retries",
      role_pain:
        "Order-to-doorstep orchestration with substitution, SLA timers, and customer-facing notifications",
    },
  },
  {
    account_domain: "heb.com",
    email: "alex.brenner@heb.com",
    first_name: "Alex",
    last_name: "Brenner",
    contact_linkedin: "https://www.linkedin.com/in/alex-brenner-dev",
    job_title: "Tech Lead, Curbside",
    seniority: "Lead",
    department: "Engineering",
    contact_country: "United States",
    custom_data: {
      event_memory:
        "Talked about how their curbside handoff flow today is a mess of cron jobs and push notifications",
      role_pain:
        "Timer-driven multi-party handoff (shopper → curbside → customer) with real deadlines",
    },
  },
];

// ---------------------------------------------------------------------------
// Email strategy (PVP — max 3 emails; perfect for a warm, event-referenced cold sequence)
// ---------------------------------------------------------------------------

const EMAIL_STRATEGY = {
  framework: "PVP",
  framework_rationale:
    "PVP is the right fit: attendance at the Hangar Bar happy hour is a dense per-person signal, and per-account enrichment gives us 2+ verifiable data points (stack, workflow use case, recent signal). Lead email 1 with an observation-only-possible-because-we-paid-attention; reserve a single bump and a final tap.",
  sequence_length: 3,
  field_mapping: {
    primary: ["event_memory", "workflow_use_case", "platform_stack_signal"],
    secondary: ["role_pain", "recent_engineering_signal"],
  },
  tokens: [
    {
      key: "event_opener",
      description:
        "One-line reference to the specific moment we saw this person engage at Hangar Bar.",
      default_value: "great to see you at the Hangar Bar happy hour last week",
    },
    {
      key: "workflow_angle",
      description: "The Vercel-Workflows framing most relevant to this account.",
      default_value:
        "a way to pull long-running background jobs out of your cron+queue patchwork",
    },
    {
      key: "demo_promise",
      description:
        "What the prospect gets in a 30-minute demo — framed around their domain.",
      default_value:
        "a live walkthrough of how Workflows handles retries, long waits, and external webhooks in the kind of flow your team already runs",
    },
    {
      key: "bump_angle",
      description:
        "Different angle for the second email — usually a fresh company-level signal.",
      default_value:
        "saw your team shipped something relevant recently and wanted to send one more note",
    },
  ],
  personalization_rules: [
    {
      id: "rule-event-memory",
      token_key: "event_opener",
      when: "has(custom.event_memory)",
      value: "still thinking about {{custom.event_memory}}",
      rationale:
        "If we captured a specific moment for this person at the event, use it — it is the single highest-trust opener we have.",
    },
    {
      id: "rule-workflow-usecase",
      token_key: "workflow_angle",
      when: "has(account.custom.workflow_use_case)",
      value:
        "specifically for {{account.custom.workflow_use_case}} on the {{company.company_name}} side",
      rationale:
        "When we have a company-specific use case, anchor the angle there rather than a generic Workflows pitch.",
    },
    {
      id: "rule-recent-signal",
      token_key: "bump_angle",
      when: "has(account.custom.recent_engineering_signal)",
      value:
        "saw {{account.custom.recent_engineering_signal}} and it lined up neatly with what we were talking about",
      rationale:
        "Email 2 earns its place with a fresh external signal that isn't just a restatement of email 1.",
    },
  ],
  sequence: [
    {
      step: 1,
      day_offset: 0,
      is_thread: false,
      subject_variants: [
        "after the hangar bar panel",
        "quick note from austin",
      ],
      body_template:
        "hi {{first_name}},\n\n{{token.event_opener}}.\n\nwe just launched vercel workflows — {{token.workflow_angle}}. thought of {{company.company_name}} given what we talked about.\n\nopen to a reply if you want {{token.demo_promise}}?\n\nguy",
      cta: "reply-only",
      goal: "Earn a reply by proving we actually paid attention at the event.",
    },
    {
      step: 2,
      day_offset: 3,
      is_thread: true,
      subject_variants: ["one more on workflows", "re: after the hangar bar panel"],
      body_template:
        "{{first_name}} — {{token.bump_angle}}.\n\nif a 30-minute demo of workflows tuned to how your team runs would be useful, happy to set one up this week or next.\n\nguy",
      cta: "reply-only",
      goal: "Surface a fresh signal and make the demo ask explicit without being pushy.",
    },
    {
      step: 3,
      day_offset: 7,
      is_thread: true,
      subject_variants: ["closing the loop", "last note"],
      body_template:
        "{{first_name}} — closing the loop on my side.\n\nif workflows is not a fit right now, no worries at all. if the timing is just off, reply with a month and i will circle back then.\n\nguy",
      cta: "reply-only",
      goal: "Leave the door open without begging; capture future-timing signal.",
    },
  ],
  copy_rules_applied: [
    "Subjects lowercase, 2–5 words, no punctuation",
    "No em-dashes or exclamation marks anywhere",
    "Single-sentence paragraphs",
    "Email 1 body under 75 words",
    "CTA in E1 is reply-only (no calendar link)",
    "Offer categories rotate (time → money → risk across the three steps via implicit framing)",
  ],
};

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function main() {
  console.log("→ Inserting campaign");
  const { data: campaign, error: campaignErr } = await supabase
    .from("campaigns")
    .insert({
      name: CAMPAIGN_NAME,
      campaign_type: CAMPAIGN_TYPE,
      audience: AUDIENCE,
      goals: GOALS,
      providers: PROVIDERS,
      enrichment_spec: ENRICHMENT_SPEC,
      email_strategy: EMAIL_STRATEGY,
      status: "ready",
    })
    .select("id")
    .single();

  if (campaignErr || !campaign) {
    console.error("campaign insert failed", campaignErr);
    process.exit(1);
  }
  const campaignId = campaign.id;
  console.log(`  campaign_id = ${campaignId}`);

  console.log("→ Inserting 5 accounts");
  const accountRows = ACCOUNTS.map((a) => ({
    campaign_id: campaignId,
    company_name: a.company_name,
    company_domain: a.company_domain,
    company_website: a.company_website,
    company_linkedin: a.company_linkedin,
    company_description: a.company_description,
    industry_iso: a.industry_iso,
    employee_count: a.employee_count,
    hq_country: a.hq_country,
    funding_stage: a.funding_stage,
    custom_data: a.custom_data,
    enrichment_status: "enriched",
    summary: a.summary,
    angle: a.angle,
    insights: a.insights,
    summary_generated_at: new Date().toISOString(),
  }));

  const { data: insertedAccounts, error: accountsErr } = await supabase
    .from("accounts")
    .insert(accountRows)
    .select("id, company_domain");

  if (accountsErr || !insertedAccounts) {
    console.error("accounts insert failed", accountsErr);
    process.exit(1);
  }

  const domainToAccountId = new Map();
  for (const row of insertedAccounts) {
    domainToAccountId.set(row.company_domain, row.id);
  }

  console.log("→ Inserting 10 contacts");
  const contactRows = CONTACTS.map((c) => ({
    campaign_id: campaignId,
    account_id: domainToAccountId.get(c.account_domain) ?? null,
    email: c.email,
    first_name: c.first_name,
    last_name: c.last_name,
    contact_linkedin: c.contact_linkedin,
    job_title: c.job_title,
    seniority: c.seniority,
    department: c.department,
    contact_country: c.contact_country,
    custom_data: c.custom_data,
    enrichment_status: "enriched",
  }));

  const { error: contactsErr } = await supabase.from("contacts").insert(contactRows);
  if (contactsErr) {
    console.error("contacts insert failed", contactsErr);
    process.exit(1);
  }

  console.log("\n✓ Seed complete");
  console.log(`  Campaign:  ${CAMPAIGN_NAME}`);
  console.log(`  Accounts:  ${insertedAccounts.length}`);
  console.log(`  Contacts:  ${contactRows.length}`);
  console.log(`  Open it:   http://localhost:3001/campaigns/${campaignId}`);
  console.log(`  (routes straight to /preview since email_strategy is set)`);
}

await main();
