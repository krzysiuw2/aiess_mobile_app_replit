-- Per-user notification preferences (applied to project fcfuuwmzwxltxsgmcqck on 2026-07-24).
-- Currently holds the quiet-hours (do-not-disturb) window, enforced server-side
-- by the send-push edge function in tokensForSite(). Times are minutes since
-- midnight in the user's stored IANA timezone (captured by the app on save).

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quiet_hours_enabled boolean not null default false,
  quiet_start_min smallint not null default 1320
    check (quiet_start_min >= 0 and quiet_start_min < 1440),
  quiet_end_min smallint not null default 420
    check (quiet_end_min >= 0 and quiet_end_min < 1440),
  timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Per-user push notification preferences (quiet hours). Enforced by the send-push edge function.';
comment on column public.notification_prefs.quiet_start_min is
  'Quiet window start, minutes since midnight in the user''s timezone (default 22:00).';
comment on column public.notification_prefs.quiet_end_min is
  'Quiet window end, minutes since midnight in the user''s timezone (default 07:00).';

alter table public.notification_prefs enable row level security;

create policy "Users can read own notification prefs"
  on public.notification_prefs
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own notification prefs"
  on public.notification_prefs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own notification prefs"
  on public.notification_prefs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
