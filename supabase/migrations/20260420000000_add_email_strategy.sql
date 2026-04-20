-- Phase 4 (marketing strategist) additions.
-- Stores campaign-level email strategy (framework + sequence templates + tokens + personalization rules)
-- and per-contact overrides for personalized values.

alter table campaigns add column email_strategy jsonb;
alter table campaigns add column strategy_run_id text;

alter table contacts add column email_overrides jsonb not null default '{}'::jsonb;
