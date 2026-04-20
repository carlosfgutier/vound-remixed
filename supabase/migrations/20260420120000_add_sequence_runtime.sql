-- Phase 5: sequence runtime (Resend + Workflow DevKit).

-- Campaign-level demo mode: when true, sends are mocked and time between steps
-- is compressed. When false, real Resend API is used and day_offset is in days.
alter table campaigns add column demo_mode boolean not null default true;
alter table campaigns add column launch_run_id text;

-- Terminal/active state for each contact's sequence run.
do $$ begin
  create type sequence_state as enum (
    'not_started',
    'active',
    'completed',
    'exited_replied',
    'exited_bounced',
    'exited_complained',
    'exited_failed'
  );
exception when duplicate_object then null; end $$;

alter table contacts add column sequence_state sequence_state not null default 'not_started';
alter table contacts add column sequence_run_id text;
alter table contacts add column current_step integer not null default 0;
alter table contacts add column exited_at timestamptz;
alter table contacts add column exit_reason text;

-- One row per email we asked Resend (or the mock) to send.
do $$ begin
  create type send_status as enum (
    'queued',
    'sent',
    'delivered',
    'opened',
    'bounced',
    'complained',
    'replied',
    'failed'
  );
exception when duplicate_object then null; end $$;

create table email_sends (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references campaigns(id) on delete cascade,
  contact_id      uuid not null references contacts(id) on delete cascade,
  step            integer not null,
  message_id      text,           -- Resend id or mock id
  subject         text not null,
  body_rendered   text not null,
  status          send_status not null default 'queued',
  error           text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  replied_at      timestamptz,
  bounced_at      timestamptz,
  complained_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index email_sends_campaign_idx on email_sends(campaign_id);
create index email_sends_contact_idx  on email_sends(contact_id);
create unique index email_sends_msg_uniq on email_sends(message_id) where message_id is not null;

create trigger email_sends_touch before update on email_sends for each row execute function touch_updated_at();

alter table email_sends enable row level security;
