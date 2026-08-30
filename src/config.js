// Ridgecrest CAD — Supabase connection config.
// The anon key is meant to be public (Supabase enforces access via Row
// Level Security, not by hiding this key) — see supabase/schema.sql for
// the security notes on what that means for this app.
//
// Fill these in with your project's values (Supabase dashboard → Project
// Settings → API) before deploying. Until you do, the app will show a
// "Not configured" screen instead of trying to run against a placeholder.
window.__CAD_CONFIG = {
  SUPABASE_URL: "https://zettzpbwokaxkzdyhimo.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpldHR6cGJ3b2theGt6ZHloaW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2ODYxMDksImV4cCI6MjEwMzI2MjEwOX0.o2ReZaEnhWirMpdvBRZPYIm12L_Rpb3QX5AFfUnmmaU"
};
