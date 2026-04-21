-- Add redesign fields: campaign-level providers + per-account AI summaries
-- for the 3-phase UI (Details → Loading → Preview).

alter table public.campaigns
  add column if not exists providers jsonb not null default '[]'::jsonb;

alter table public.accounts
  add column if not exists summary text,
  add column if not exists angle text,
  add column if not exists insights jsonb,
  add column if not exists summary_generated_at timestamptz;
