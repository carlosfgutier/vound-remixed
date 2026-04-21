# vound-remixed

A remix of the vound outbound GTM app that collapses the old six-phase wizard
into a three-act story: **Details → Loading → Preview → Sequence**. The user
submits a brief, the system researches every account and contact and drafts an
email strategy in the background, and then the user reviews one unified
workspace before launching a durable per-contact sending sequence.

Live at **https://vound-remixed.vercel.app**.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript 5, Node.js 24 |
| Styling | Tailwind v4 + CVA primitives + Geist |
| Data | Supabase Postgres (Marketplace-provisioned) |
| Durable runtime | [Workflow DevKit](https://useworkflow.dev) v4 (`"use workflow"` / `"use step"`) |
| AI | [AI SDK](https://ai-sdk.dev) v6 via **Vercel AI Gateway** (Anthropic Claude Sonnet 4.6) |
| Email delivery | Resend (with demo-mode dry-run) |
| Hosting | Vercel (Fluid Compute) |

The entire AI surface area routes through the **Vercel AI Gateway** using
OIDC — no provider keys baked in — and every long-running operation
(enrichment, strategy generation, per-contact sequence) is a Workflow that
survives cold starts, cancellations, and redeploys.

---

## The four phases

```
  /campaigns/new                   /campaigns/[id]/loading             /campaigns/[id]/preview             /campaigns/[id]/sequence
 ┌───────────────────┐            ┌─────────────────────────┐         ┌────────────────────────────┐     ┌──────────────────────┐
 │  01  Details      │ submit  ▶  │  02  Loading            │  done ▶ │  03  Preview               │  ▶  │  04  Sequence        │
 │  3-step wizard:   │            │  enrichCampaign wf +    │         │  Fields · Enrichment ·     │     │  Durable per-contact │
 │  brief / contacts │            │  generateEmailStrategy  │         │  Emails (render preview)   │     │  send sequences      │
 │  / sources        │            │  (SSE-streamed events)  │         │                            │     │                      │
 └───────────────────┘            └─────────────────────────┘         └────────────────────────────┘     └──────────────────────┘
```

Guards:

- `/loading` redirects to `/preview` once `email_strategy` is populated.
- `/preview` redirects to `/loading` if no strategy yet.
- The phase tracker unlocks all downstream phases once `email_strategy` is
  set, so users can bounce between snapshots freely.

---

## Running locally

```bash
# 1. Install
npm install

# 2. Pull OIDC + Supabase env from Vercel (project must be linked)
vercel link
vercel env pull .env.local --yes

# 3. Apply migrations to the linked Supabase project
#    (migrations live in supabase/migrations/)

# 4. Dev
npm run dev
```

`vercel env pull` wires up `VERCEL_OIDC_TOKEN` (for the AI Gateway), the
Supabase URL + service role key, and Resend. The OIDC token is short-lived
(~24h); re-run `vercel env pull` when it expires locally.

### Seeding a demo campaign

```bash
node --env-file=.env.local scripts/seed-vercel-austin-campaign.mjs
```

Seeds a fully-enriched, strategy-ready campaign (Vercel Austin Hangar Bar
recruiting follow-up) so you can jump straight to Preview / Sequence without
running the enrichment pipeline.

---

## Project structure

```
vound-remixed/
├── app/                         Next.js App Router
│   ├── (dashboard)/             Dashboard layout (sidebar + phase tracker)
│   │   └── campaigns/
│   │       ├── new/             Phase 1 — 3-step wizard (brief/contacts/sources)
│   │       │   └── actions.ts   defineEnrichmentAction: generates enrichment
│   │       │                    spec, inserts campaign/accounts/contacts,
│   │       │                    starts enrichCampaignWorkflow.
│   │       └── [id]/
│   │           ├── details/     Read-only snapshot of submitted brief
│   │           ├── loading/     Phase 2 — streams enrichment + strategy events
│   │           ├── preview/     Phase 3 — Fields | Enrichment | Emails tabs
│   │           └── sequence/    Phase 4 — per-contact send state + controls
│   └── api/
│       ├── campaigns/[id]/enrich     POST=start, GET=SSE stream of run
│       ├── campaigns/[id]/messaging  Same shape, for the strategy run
│       ├── campaigns/[id]/status     Thin JSON health check for polling
│       ├── campaigns/[id]/sequence   Launch + simulate endpoints
│       └── webhooks/resend           Email event fan-out → hook resume
│
├── workflows/                   "use workflow" entry points (see below)
│   ├── enrich-campaign.ts       Phase 2a — per-account + per-contact enrichment
│   ├── generate-email-strategy.ts  Phase 2b — AI strategist; kicks automatically
│   ├── launch-campaign.ts       Phase 4 boot — fans out per-contact workflows
│   └── send-contact-sequence.ts    Durable sending loop (sleep+hook race)
│
├── lib/
│   ├── ai/                      AI SDK calls (generateText + Output.object)
│   │   ├── generate-enrichment-spec.ts
│   │   └── generate-email-strategy.ts
│   ├── enrichment/              Per-field AI enrichment + reconciliation +
│   │                            mock provider lookup + company summaries
│   ├── email/                   Template rendering, token/rule DSL, Resend
│   ├── sequence/                Send-state transitions, Resend webhook
│   ├── schema/                  Zod schemas (campaign-input, enrichment-spec,
│   │                            email-strategy)
│   ├── supabase/                Admin + SSR clients
│   ├── csv/                     Papaparse wrapper with lowercase normalization
│   ├── phases.ts                Phase model + href resolver
│   └── campaign-goals.ts        Static goal catalog
│
├── components/
│   ├── campaign-form/           Wizard shell, steps, ProvidersGrid, CSV intake
│   ├── phase-tracker/           Reusable top-of-page phase nav
│   ├── loading/                 Witty messages + SSE subscription UI
│   ├── preview/                 Tab UI: field schema, enriched tables,
│   │                            cell popovers, company insights, emails
│   └── sequence/                Per-contact state board
│
├── supabase/migrations/         Version-controlled schema
│   ├── 20260419022501_initial_schema.sql
│   ├── 20260419180000_add_enrichment_run_id.sql
│   ├── 20260420000000_add_email_strategy.sql
│   ├── 20260420120000_add_sequence_runtime.sql
│   └── 20260421000000_add_redesign_fields.sql
│
├── scripts/
│   └── seed-vercel-austin-campaign.mjs   Fully-enriched demo campaign
│
├── sample-data/                 Test CSVs
└── AGENTS.md                    Reminder that Next.js 16 has breaking
                                 changes vs. older training data
```

---

## Workflows

Every background operation runs inside the **Workflow DevKit**. Workflow
functions orchestrate; step functions do the I/O. Steps get automatic retry,
replay caching, and sandbox-free Node.js access.

| Workflow | Trigger | What it does |
| --- | --- | --- |
| `enrichCampaignWorkflow` | `defineEnrichmentAction` after submit | Loads the campaign, runs per-account and per-contact enrichment with bounded concurrency (3), reconciles provider hits with AI outputs, emits SSE events via `getWritable<EnrichmentEvent>()`, and kicks off `generateEmailStrategyWorkflow` so Preview has a strategy by the time the user arrives. |
| `generateEmailStrategyWorkflow` | Chained from enrich | Calls the AI strategist, validates against `emailStrategySchema`, writes the result to `campaigns.email_strategy`, and streams a `{type: "done"}` marker the loading page listens for. |
| `launchCampaignWorkflow` | "Create and Launch" button in Preview Emails tab | Fans out one `sendContactSequenceWorkflow` per contact. Returns immediately; the fan-out continues durably. |
| `sendContactSequenceWorkflow` | Per-contact | Per strategy step: render → persist queued send → send via Resend → `Promise.race([sleep(step.day_offset), hook])`. The hook token is `contactHookToken(contactId, step)`; Resend webhooks resume it with `{kind: "reply" \| "bounce" \| "complaint" \| "opened" \| "delivered"}`. A terminal event exits the sequence early. |

**Why Workflow over plain server actions / queues:**

- The enrichment fan-out takes minutes. Workflows are unaffected by request
  timeouts and survive redeploys.
- The sending sequence lives for days. `sleep("3d")` + a live hook is the
  primitive we need — no cron, no polling, no state machine reimplementation.
- Each step's output is cached, so if a workflow retries we don't re-issue AI
  calls or re-insert DB rows.
- The SSE streams the loading page listens to are literally the Workflow's
  own default + namespaced streams surfaced over HTTP.

---

## AI SDK usage

All four AI calls route through the Vercel AI Gateway (plain
`"anthropic/claude-sonnet-4.6"` string model id, OIDC auth). Each uses
`generateText({ output: Output.object({ schema: <zodSchema> }) })` so the model
is forced to emit a parsed, typed object — no JSON-extraction regex anywhere
in the codebase.

| Module | Schema | Purpose |
| --- | --- | --- |
| `lib/ai/generate-enrichment-spec.ts` | `enrichmentSpecSchema` | Reads the brief, returns the custom fields to research per-account and per-contact, a primary source per field, personalization hooks, and qualification rubrics. Capped at 5 custom fields per side. |
| `lib/ai/generate-email-strategy.ts` | `emailStrategySchema` | Given the enrichment spec, picks a framework (PVP / PQS / Eric), writes the subject + body templates, and defines the token/rule DSL the deterministic renderer uses for per-contact substitution. |
| `lib/enrichment/ai-enrichment.ts` | account + contact sub-schemas | Runs the per-row enrichment. Receives the standard row plus the enrichment spec and returns the custom field values. |
| `lib/enrichment/generate-company-summary.ts` | summary schema | Lazy: triggered when a user opens a company insight card in Preview. Produces an account-level summary, angle, and insights; persisted to `accounts.summary / angle / insights`. |

A deliberate design choice: **the LLM writes variables, not emails.** The
strategist outputs templates + rules; the runtime's
`lib/email/render-template.ts` does the substitution. This keeps per-contact
sends deterministic, auditable, and free from runtime model drift.

---

## Key implementation details

- **Phase 2 loading is SSE-driven.** `app/api/campaigns/[id]/enrich` returns
  `run.getReadable()` from the Workflow run; the client subscribes and updates
  the phase tracker + progress copy as events arrive.
- **Read-only Details.** Once a campaign exists, `/campaigns/[id]/details`
  shows the frozen brief (name, type, audience, ranked goals, selected
  providers, contact/company counts). The wizard stays at `/campaigns/new` for
  fresh campaigns.
- **Phase tracker unlocking.** `PhaseTracker` takes an optional `unlockFuture`
  prop; the Details page passes it when `email_strategy` is not null so users
  can navigate forward from the snapshot.
- **CSV normalization.** `parseCsvFile` trims + lowercases + snake_cases every
  header, so a CSV with `"Email"` / `"First Name"` lines up with the schema
  refine and `actions.ts` writes without bouncing the user back to the
  contacts step on submit.
- **Durable email send.** The per-contact workflow uses `Promise.race` of
  `sleep` and a Workflow hook. Resend webhook → `resumeHook(token, payload)`
  → the race resolves → the workflow exits or advances deterministically.

---

## Environment variables

Pulled automatically by `vercel env pull`:

```
VERCEL_OIDC_TOKEN            # AI Gateway auth (short-lived JWT)
NEXT_PUBLIC_SUPABASE_URL     # Marketplace-provisioned Supabase
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY               # Email delivery (demo-mode available)
```

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev on Turbopack |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |
| `vercel --prod` | Deploy current working tree to production |
| `npx workflow inspect runs --backend vercel --project vound-remixed` | Inspect running / past workflow runs |
| `npx workflow web <run_id>` | Open a specific run in the dashboard |

---

## Notes

This is a Next.js 16 app. Many APIs differ from earlier Next.js training data
(`params` is a `Promise`, `proxy.ts` replaces `middleware.ts`, etc.). See
`AGENTS.md` — the short version is: consult `node_modules/next/dist/docs/`
before writing route or server-action code.
