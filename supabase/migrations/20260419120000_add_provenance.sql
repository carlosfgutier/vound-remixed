-- Per-field provenance: which source (ai vs provider) produced each resolved value,
-- and what each source returned. Shape: { field_key: { chosen, source, ai, provider } }
alter table accounts add column provenance jsonb not null default '{}'::jsonb;
alter table contacts add column provenance jsonb not null default '{}'::jsonb;
