-- Initial vBound schema: campaigns, accounts, contacts.
-- Server-side access only (via SUPABASE_SERVICE_ROLE_KEY).
-- RLS is enabled but no policies are defined — client reads go through server actions.

create type enrichment_status as enum ('pending', 'enriching', 'enriched', 'failed');
create type campaign_status as enum ('draft', 'defining', 'enriching', 'ready', 'live', 'paused', 'completed');

create table campaigns (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  campaign_type   text not null,
  audience        text not null,
  goals           jsonb not null,              -- array of { id, customLabel? } in ranked order
  enrichment_spec jsonb,                       -- full EnrichmentSpec from Phase 2
  status          campaign_status not null default 'draft',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table accounts (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  -- standard fields (nullable, enrichment fills them in)
  company_name        text,
  company_linkedin    text,
  company_domain      text,
  company_website     text,
  company_description text,
  industry_iso        text,
  employee_count      integer,
  hq_country          text,
  funding_stage       text,
  -- custom fields defined by Phase 2 spec, keyed by field.key
  custom_data         jsonb not null default '{}'::jsonb,
  enrichment_status   enrichment_status not null default 'pending',
  enrichment_error    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table contacts (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  account_id        uuid references accounts(id) on delete set null,
  -- standard fields
  email             text not null,
  first_name        text,
  last_name         text,
  contact_linkedin  text,
  job_title         text,
  seniority         text,
  department        text,
  contact_country   text,
  -- custom fields defined by Phase 2 spec, keyed by field.key
  custom_data       jsonb not null default '{}'::jsonb,
  enrichment_status enrichment_status not null default 'pending',
  enrichment_error  text,
  -- preserve any extra columns the user uploaded in the CSV (e.g. 'source', 'utm')
  raw_import        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index accounts_campaign_idx on accounts(campaign_id);
create index contacts_campaign_idx on contacts(campaign_id);
create index contacts_account_idx  on contacts(account_id);
create unique index contacts_campaign_email_uniq on contacts(campaign_id, lower(email));

-- updated_at triggers
create or replace function touch_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger campaigns_touch before update on campaigns for each row execute function touch_updated_at();
create trigger accounts_touch  before update on accounts  for each row execute function touch_updated_at();
create trigger contacts_touch  before update on contacts  for each row execute function touch_updated_at();

-- RLS: enable, no policies. All app reads/writes go through the service role.
alter table campaigns enable row level security;
alter table accounts  enable row level security;
alter table contacts  enable row level security;
