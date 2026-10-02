-- Adds the Dispatch and Admin account types (src/app.js ROLE_NAV).
-- APPLIED to the production project on 2026-10-02 (along with promoting S-1 to ADMIN).
-- Run this once in the Supabase SQL editor on an existing database, BEFORE deploying the app
-- version that uses it. (A fresh install gets all of this from schema.sql.)
--
--   ADMIN    - every sidebar tab, every site
--   SUPV     - Supervisor: every sidebar tab, only the site(s) they're assigned to
--   DISPATCH - Live Map, Dispatch, S.C.I.C., Call History, Patrol Chat, Users, Radio PTT; every site
--   GUARD    - Dispatch, Call History, Field Reports, Parking Lot Violations, Guard Notes,
--              Patrol Tours, Users, Radio PTT, Patrol Chat, Truck Log; only their assigned site(s)
--   CLIENT   - unchanged (Truck Log for one site)

alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('ADMIN','SUPV','DISPATCH','GUARD','CLIENT'));

create or replace function set_user_role(p_callsign text, p_role text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_role not in ('ADMIN','SUPV','DISPATCH','GUARD') then
    raise exception 'Invalid account type: %', p_role;
  end if;
  update users set role = p_role where callsign = p_callsign and role <> 'CLIENT';
end;
$$;
grant execute on function set_user_role(text,text) to anon, authenticated;

-- Before this change, a SUPV account with no assigned site ("All Sites (Dispatch/Admin)" on the
-- Users tab) was how Dispatch/Admin accounts were set up. Make those Admin so they keep full
-- access; change any that should be Dispatch from the Users tab ("Account type").
update users set role = 'ADMIN' where role = 'SUPV' and assigned_post_id is null;
