-- Remote feature flags for the mobile app (applied to project fcfuuwmzwxltxsgmcqck on 2026-07-01).
-- Clients read-only; ops toggle via SQL/dashboard. Seeded with the DDB
-- config-plane flag, OFF by default.

create table if not exists public.app_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  updated_at timestamptz not null default now()
);

comment on table public.app_feature_flags is 'Remote feature flags for the mobile app. Read-only for clients; toggled by ops via SQL/dashboard.';

alter table public.app_feature_flags enable row level security;

create policy "Authenticated users can read feature flags"
  on public.app_feature_flags
  for select
  to authenticated
  using (true);

-- No insert/update/delete policies: clients cannot write.

insert into public.app_feature_flags (key, enabled, description)
values (
  'use_ddb_config_plane',
  false,
  'When true, the app reads/writes schedules via the DDB config-plane per-section API (requires the aws-config-proxy edge function to be deployed). When false, uses the legacy /schedules API.'
)
on conflict (key) do nothing;
