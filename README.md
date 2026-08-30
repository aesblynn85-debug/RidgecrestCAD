# Ridgecrest CAD

Browser-based computer-aided dispatch console for Ridgecrest Threat Advisory security
operations — dispatch/calls, guard & unit roster, post directory & patrol tours, patrol
chat, truck/gate log, parking lot violations, field reports, and an activity log.

Plain static HTML/CSS/JS (no build step, no framework) backed by [Supabase](https://supabase.com)
for the database and realtime sync, deployed on [Vercel](https://vercel.com).

## First-time setup

1. **Create a Supabase project** (or use an existing one) at supabase.com.
2. In the Supabase SQL editor, run `supabase/schema.sql`, then `supabase/seed.sql`.
   These create all the tables/RLS policies and load the starting roster, posts,
   two reports, and activity history that this console launched with.
3. In your Supabase project settings → API, copy the **Project URL** and the
   **anon public key** into `src/config.js`.
4. Open `index.html` — either locally (any static file server; opening the file
   directly with `file://` won't work because of CORS) or after deploying to Vercel.
5. Sign in with any seeded callsign (`S-1` is the supervisor, `ST2-61` a guard) and
   PIN `1234`. Change it from the Users page — see the security note below.

## Deploying to Vercel

This is a zero-config static site: point a new Vercel project at this repo with no
build command and no output directory override, and it just serves `index.html`.
Nothing needs to be an environment variable — the Supabase anon key in `src/config.js`
is meant to be public (see the security note in `supabase/schema.sql`); it's your
Row Level Security policies that actually gate access, not keeping that key secret.

## Editing the app

`src/app.js`, `src/part2.js`, and `src/part3.js` are the source files (login/shell,
dispatch/units/posts/chat/trucks, and parking/reports/users respectively). They're
designed to share one JS closure, so they get spliced into a single
`src/app.bundle.js` — that's the file `index.html` actually loads. **After editing
any of the three source files, run `src/build.sh` to regenerate the bundle before
committing** (don't hand-edit `app.bundle.js`).

`src/db.js` is the persistence layer — it loads the whole app state from Supabase on
startup and exposes small per-entity write functions (`DB.calls.insert(...)`,
`DB.units.update(...)`, etc.) that each mutation calls right after updating the
in-memory state, plus a realtime subscription so every open screen picks up what
other guards do. `src/config.js` just holds the Supabase URL/key.

## Security note

This app uses its own callsign+PIN login rather than Supabase Auth, so (as documented
at the top of `supabase/schema.sql`) the current RLS policies let anyone holding the
public anon key read and write the database directly, bypassing the app's UI —
matching the access model of the tool's original single-link version, but worth
tightening (a login wall in front of the site, or a real migration to Supabase Auth)
before treating this as hardened for the open internet.

PINs are hashed with bcrypt (via Postgres `pgcrypto`) and verified server-side through
a `verify_pin` RPC — the client never receives password hashes.
