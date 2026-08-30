-- Ridgecrest CAD — Supabase schema
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a fresh project.
--
-- SECURITY NOTE (read this before going live):
-- This app uses its own callsign+PIN login, not Supabase Auth, so these RLS
-- policies grant the public "anon" key read/write access to every table.
-- That matches the access model of the original tool (anyone with the link
-- could use it), but it means anyone who has your Vercel URL and opens
-- devtools can read/write the database directly, bypassing the app's UI.
-- Two ways to tighten this later, roughly in order of effort:
--   1. Put the site behind a login wall (e.g. Vercel password protection or
--      an allowlist) so the URL itself isn't enough.
--   2. Migrate to real Supabase Auth (magic link / email+password per guard)
--      and rewrite these policies to check auth.uid() instead of allowing
--      anon wholesale. This is the "correct" fix but is a larger change.
-- Flagging this so it's a conscious choice, not a surprise.
--
-- checkpoint_scans stores each guard's GPS location at scan time, and
-- guard_locations stores their live position updated automatically while
-- signed in — both more sensitive than the rest of this data. They're
-- covered by the same anon policy as everything else here, so tightening
-- access (see above) applies doubly to these two tables. The Live Map tab
-- is restricted to role='SUPV' only in the UI (src/part3.js renderMap/
-- wireMap) — that is a client-side check, not a database one, so anyone
-- with the anon key can still read guard_locations directly today.

create extension if not exists "pgcrypto" with schema public;

-- ---------- users (login accounts: callsign + PIN) ----------
create table if not exists users (
  callsign text primary key,
  name text not null,
  role text not null check (role in ('SUPV','GUARD')),
  title text default '',
  pin_hash text not null,          -- bcrypt hash, never plaintext
  must_change_pin boolean not null default false,
  active boolean not null default true,
  last_sign_in timestamptz
);

-- ---------- units (roster) ----------
create table if not exists units (
  callsign text primary key,
  name text not null,
  type text not null default 'Foot Post',
  status text not null default 'OFFDUTY',
  status_since timestamptz not null default now(),
  post text default '',
  shift text default '',
  home_callsign text default ''
);

-- ---------- posts + checkpoints ----------
create table if not exists posts (
  id text primary key,
  name text not null,
  kind text default '',
  org text default '',
  address text default ''
);

create table if not exists checkpoints (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  name text not null,
  interval_min int default 120,
  last_scan timestamptz,
  last_scan_by text
);

-- Every tour scan gets its own row here with the guard's device GPS at the
-- moment they hit "Scan", so movement can be plotted on a map over time —
-- not just the checkpoint's most recent scan (that stays on checkpoints
-- above for the fast "last scanned" display). lat/lng/accuracy are nullable
-- because a scan still counts if the guard's device denies/lacks location.
create table if not exists checkpoint_scans (
  id bigint generated always as identity primary key,
  checkpoint_id text not null references checkpoints(id) on delete cascade,
  post_id text not null references posts(id) on delete cascade,
  callsign text not null,
  at timestamptz not null default now(),
  lat double precision,
  lng double precision,
  accuracy_m double precision
);
create index if not exists checkpoint_scans_checkpoint_id_idx on checkpoint_scans(checkpoint_id);
create index if not exists checkpoint_scans_callsign_at_idx on checkpoint_scans(callsign, at desc);

-- Each guard's most recent live GPS ping — one row per callsign, overwritten on every
-- upsert, so this stays cheap to query regardless of shift length. Populated by the app's
-- startLiveTracking() (src/app.js) roughly every 45s while a guard's session is open, and
-- read by the Live Map tab (src/part3.js renderMap/wireMap), which is restricted to
-- Dispatch/Supervisors/Admins (role='SUPV') in the UI.
create table if not exists guard_locations (
  callsign text primary key,
  lat double precision not null,
  lng double precision not null,
  accuracy_m double precision,
  updated_at timestamptz not null default now()
);

-- ---------- dispatch calls ----------
create table if not exists calls (
  id text primary key,
  code text default '',
  nature text default '',
  priority int not null default 3,
  post text default '',
  location text default '',
  reporting_party text default '',
  callback text default '',
  received_via text default '',
  status text not null default 'PENDING',
  assigned_unit text default '',
  created_at timestamptz not null default now()
);

create table if not exists call_supplements (
  id uuid primary key default gen_random_uuid(),
  call_id text not null references calls(id) on delete cascade,
  at timestamptz not null default now(),
  by text not null,
  text text not null
);

-- ---------- patrol chat ----------
create table if not exists chat_channels (
  id text primary key,
  name text not null,
  description text default ''
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references chat_channels(id) on delete cascade,
  from_callsign text default '',
  name text default '',
  bolo boolean not null default false,
  text text not null,
  at timestamptz not null default now()
);

-- ---------- truck / gate log ----------
create table if not exists trucks (
  id text primary key,
  company text default '',
  driver text default '',
  trailer text default '',
  tractor text default '',
  post text default '',
  purpose text default '',
  dock text default '',
  seal text default '',
  bol text default '',
  license text default '',
  notes text default '',
  time_in timestamptz not null default now(),
  time_out timestamptz
);

-- ---------- field reports ----------
create table if not exists reports (
  id text primary key,
  type text default '',
  type_label text default '',
  status text not null default 'SUBMITTED',
  attach_to_call text default '',
  post text default '',
  occurred timestamptz,
  location text default '',
  subject text default '',
  narrative text default '',
  involved_parties text default '',
  witnesses text default '',
  property_damage text default '',
  est_loss text default '',
  action_taken text default '',
  notify_injury boolean default false,
  notify_ems boolean default false,
  notify_police boolean default false,
  who_else_notified text default '',
  force_used boolean default false,
  written_by text default '',
  written_by_callsign text default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  supervisor_notes text default ''
);

-- ---------- parking lot violations ----------
create table if not exists parking_violations (
  id text primary key,
  vtype text default '',
  call_id text references calls(id) on delete set null,
  report_id text references reports(id) on delete set null,
  post text default '',
  occurred timestamptz,
  location_in_lot text default '',
  plate text default '',
  plate_state text default '',
  vehicle_desc text default '',
  driver text default '',
  narrative text default '',
  action_taken text default '',
  notify_police boolean default false,
  notify_prop_mgmt boolean default false,
  notify_tow boolean default false,
  who_else_notified text default '',
  status text not null default 'SUBMITTED',
  written_by text default '',
  written_by_callsign text default '',
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  supervisor_notes text default ''
);

-- ---------- police on property (log-only for now) ----------
create table if not exists police_on_property (
  id uuid primary key default gen_random_uuid(),
  arrived_at timestamptz not null default now(),
  departed_at timestamptz,
  agency text default '',
  officer text default '',
  reason text default '',
  notes text default ''
);

-- ---------- activity log (append-only audit trail) ----------
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  type text not null,
  actor text not null,
  text text not null
);
create index if not exists activity_log_at_idx on activity_log (at desc);

-- ---------- id sequence counters (call/report/parking numbering) ----------
create table if not exists counters (
  key text primary key,
  value int not null default 0
);
insert into counters(key, value) values ('call',0),('report',0),('parking',0)
  on conflict (key) do nothing;

create or replace function next_counter(counter_key text)
returns int language plpgsql as $$
declare v int;
begin
  update counters set value = value + 1 where key = counter_key returning value into v;
  if v is null then
    insert into counters(key, value) values (counter_key, 1) returning value into v;
  end if;
  return v;
end;
$$;

-- ================= Row Level Security =================
-- See the security note at the top of this file before enabling anon access
-- in a real deployment you plan to leave open on the public internet.

alter table users enable row level security;
alter table units enable row level security;
alter table posts enable row level security;
alter table checkpoints enable row level security;
alter table checkpoint_scans enable row level security;
alter table guard_locations enable row level security;
alter table calls enable row level security;
alter table call_supplements enable row level security;
alter table chat_channels enable row level security;
alter table chat_messages enable row level security;
alter table trucks enable row level security;
alter table reports enable row level security;
alter table parking_violations enable row level security;
alter table police_on_property enable row level security;
alter table activity_log enable row level security;
alter table counters enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['users','units','posts','checkpoints','checkpoint_scans','guard_locations','calls','call_supplements',
    'chat_channels','chat_messages','trucks','reports','parking_violations',
    'police_on_property','activity_log','counters'])
  loop
    execute format('drop policy if exists anon_all on %I;', t);
    execute format('create policy anon_all on %I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;

-- Never expose pin_hash to the client. Views/selects from the app should go
-- through this instead of "select * from users" where possible.
create or replace view users_public as
  select callsign, name, role, title, active, last_sign_in, must_change_pin from users;

-- ================= PIN auth helpers (never send pin_hash to the client) =================
create or replace function verify_pin(p_callsign text, p_pin text)
returns boolean language sql security definer set search_path = public, extensions as $$
  select coalesce(
    (select pin_hash = crypt(p_pin, pin_hash) from users where callsign = p_callsign and active),
    false
  );
$$;

create or replace function set_pin(p_callsign text, p_new_pin text)
returns void language sql security definer set search_path = public, extensions as $$
  update users set pin_hash = crypt(p_new_pin, gen_salt('bf')), must_change_pin = false
  where callsign = p_callsign;
$$;

create or replace function create_guard(p_callsign text, p_name text, p_pin text default '1234')
returns void language sql security definer set search_path = public, extensions as $$
  insert into users (callsign, name, role, title, pin_hash, must_change_pin, active)
  values (p_callsign, p_name, 'GUARD', 'Security Guard', crypt(p_pin, gen_salt('bf')), true, true);
$$;

create or replace function reset_pin(p_callsign text)
returns void language sql security definer set search_path = public, extensions as $$
  update users set pin_hash = crypt('1234', gen_salt('bf')), must_change_pin = true
  where callsign = p_callsign;
$$;

create or replace function record_sign_in(p_callsign text)
returns void language sql security definer set search_path = public, extensions as $$
  update users set last_sign_in = now() where callsign = p_callsign;
$$;

grant execute on function verify_pin(text,text) to anon, authenticated;
grant execute on function set_pin(text,text) to anon, authenticated;
grant execute on function create_guard(text,text,text) to anon, authenticated;
grant execute on function reset_pin(text) to anon, authenticated;
grant execute on function record_sign_in(text) to anon, authenticated;
grant execute on function next_counter(text) to anon, authenticated;

-- Block direct client reads of the users table (pin_hash lives there) —
-- the app should query users_public instead. Writes still go through the
-- RPC functions above so pins are always hashed server-side.
drop policy if exists anon_all on users;
create policy users_read_public on users for select to anon, authenticated using (true);
revoke select (pin_hash) on users from anon, authenticated;

-- ================= Realtime =================
-- Broadcast row changes to every connected guard so screens stay in sync.
-- Written as a guarded loop (instead of one ALTER PUBLICATION ... ADD TABLE
-- line) so re-running this file against a project that already has some of
-- these tables published doesn't error out on "already a member".
do $$
declare t text;
begin
  for t in select unnest(array['units','calls','call_supplements','chat_messages','trucks',
    'reports','parking_violations','checkpoints','checkpoint_scans','guard_locations','activity_log'])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I;', t);
    end if;
  end loop;
end $$;
