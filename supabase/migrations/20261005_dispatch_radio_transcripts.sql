-- Radio PTT → single "Dispatch" channel, and Patrol Chat → Dispatch Transcripts.
-- Run this once in the Supabase SQL editor on an existing database, BEFORE deploying the app
-- version that uses it. (A fresh install gets all of this from schema.sql.)
--
-- Every Radio PTT transmission on the Dispatch channel is transcribed on the talking unit's
-- device (browser speech recognition) and saved here as one row: when it was keyed up, which
-- unit/callsign was talking, and the text. Shown in the Dispatch Transcripts tab, which only
-- Supervisor, Admin and Dispatch accounts can open (src/app.js ROLE_NAV).
--
-- The old chat_channels / chat_messages tables are left in place untouched (nothing is deleted),
-- the app just no longer reads or writes them.

create table if not exists radio_transcripts (
  id text primary key default gen_random_uuid()::text,  -- text, so the app's own uid() ids fit
  at timestamptz not null default now(),        -- when the unit keyed up (pressed Talk)
  ended_at timestamptz,                          -- when they released Talk
  channel text not null default 'dispatch',
  callsign text not null default '',             -- unit / callsign that was talking
  name text not null default '',                 -- account name of the person talking
  post text default '',                          -- the unit's shift site at the time, if any
  text text not null default ''
);
create index if not exists radio_transcripts_at_idx on radio_transcripts(at desc);
create index if not exists radio_transcripts_callsign_idx on radio_transcripts(callsign);

alter table radio_transcripts enable row level security;
drop policy if exists anon_all on radio_transcripts;
create policy anon_all on radio_transcripts for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'radio_transcripts'
  ) then
    alter publication supabase_realtime add table radio_transcripts;
  end if;
end $$;
