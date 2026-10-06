-- Daily Activity Reports (DAR).
-- Run this once in the Supabase SQL editor on an existing database, BEFORE deploying the app
-- version that uses it. (A fresh install gets all of this from schema.sql.)
--
-- When a unit's status is changed to "10-42 Off Duty" (ENDSHIFT), the browser that made the
-- change builds a Daily Activity Report for that unit's shift and saves it here. Reports are
-- listed in the Activity Log tab, which only Supervisor and Admin accounts can open.

-- One row per unit status change, so a shift can be rebuilt: when the unit went on duty, and when
-- it was dispatched to / arrived on scene at / went back in service from each call.
create table if not exists unit_status_events (
  id text primary key default gen_random_uuid()::text,
  callsign text not null,                 -- unit callsign
  at timestamptz not null default now(),
  from_status text default '',
  to_status text not null,
  call_id text default '',                -- the call the unit was on for this change, if any
  post text default '',                   -- the unit's shift site at the time
  changed_by text default ''              -- account that made the change
);
create index if not exists unit_status_events_callsign_at_idx on unit_status_events(callsign, at desc);
create index if not exists unit_status_events_at_idx on unit_status_events(at desc);

-- The generated reports. `data` holds the full snapshot (calls, reports, parking violations,
-- truck log entries) so the report reads the same later even if those records change.
create table if not exists daily_activity_reports (
  id text primary key,
  created_at timestamptz not null default now(),
  callsign text not null,                 -- unit number
  account_callsign text default '',       -- linked login account (units.home_callsign), if any
  name text default '',
  post_id text default '',
  post_name text default '',
  on_duty_at timestamptz,
  off_duty_at timestamptz not null,
  generated_by text default '',
  data jsonb not null default '{}'::jsonb
);
create index if not exists daily_activity_reports_off_idx on daily_activity_reports(off_duty_at desc);
create index if not exists daily_activity_reports_callsign_idx on daily_activity_reports(callsign);

-- Truck log entries now record which account checked the truck in / out, so they can be
-- attributed to a guard's Daily Activity Report.
alter table trucks add column if not exists logged_by text default '';
alter table trucks add column if not exists checked_out_by text default '';

alter table unit_status_events enable row level security;
alter table daily_activity_reports enable row level security;
drop policy if exists anon_all on unit_status_events;
create policy anon_all on unit_status_events for all to anon, authenticated using (true) with check (true);
drop policy if exists anon_all on daily_activity_reports;
create policy anon_all on daily_activity_reports for all to anon, authenticated using (true) with check (true);

do $$
declare t text;
begin
  for t in select unnest(array['unit_status_events','daily_activity_reports'])
  loop
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
end $$;
