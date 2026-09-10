/* Ridgecrest CAD — rebuilt console. Single-page app driven by STATE, persisted to Supabase. */
(function(){
  "use strict";

 /* ---------------- constants ---------------- */
 var NAV = [
   {id:"dispatch", label:"Dispatch", ic:"◉"},
   {id:"units", label:"Units", ic:"▤"},
   {id:"sites", label:"Sites", ic:"◇"},
   {id:"tours", label:"Patrol Tours", ic:"⚑"},
   {id:"chat", label:"Patrol Chat", ic:"✇"},
   {id:"radio", label:"Radio PTT", ic:"▶"},
   {id:"trucks", label:"Truck Log", ic:"▢"},
   {id:"parking", label:"Parking Lot Violations", ic:"⚠"},
   {id:"reports", label:"Field Reports", ic:"☷"},
   {id:"guardnotes", label:"Guard Notes", ic:"✎"},
   {id:"log", label:"Activity Log", ic:"≡"},
   {id:"users", label:"Users", ic:"☺"},
   // Dispatch/Supervisor/Admin only — filtered out of the sidebar for guards in renderShell,
   // and renderMap() itself refuses to render for anyone else as a second line of defense.
   {id:"map", label:"Live Map", ic:"◎", supvOnly:true},
   {id:"callhistory", label:"Call History", ic:"▣", supvOnly:true}
   ];

 var REPORT_TYPES = [
   ["general","General Incident","Anything that needs a written record and does not fit another type."],
   ["injury","Injury / Medical",""],
   ["property","Property Damage",""],
   ["theft","Theft / Vandalism",""],
   ["trespass","Trespass / Unauthorized",""],
   ["vehicle","Vehicle / Traffic",""],
   ["force","Use of Force",""],
   ["maintenance","Maintenance / Hazard",""],
   ["lostfound","Lost & Found",""],
   ["other","Other",""]
   ];

 var VIOLATION_TYPES = [
   ["handicap","Handicap Violation"],
   ["firelane","Fire Lane Violation"],
   ["unsafe","Unsafe Vehicle Operation"],
   ["reserved","Reserved Parking Violation"],
   ["wrongway","Wrong Way Driving"],
   ["other","Other Safety Violation"]
   ];

 var ACTION_TAKEN_OPTS = ["Warning Issued","Citation Issued","Vehicle Tagged","Tow Requested","Tow Completed","Vehicle Relocated","No Action"];

 var UNIT_TYPES = ["Foot Post","Vehicle Patrol","Golf Cart Patrol","Bike Patrol","K9 Unit","Supervisor","Console / Dispatch","Other"];

 var CALL_CODES = [
   "Signal 3 — Fire Alarm","Signal 5 — Bomb Threat","Signal 14 — Threats","Signal 19 — Smoke Odor",
   "Signal 22 — Area Check","Signal 29 — Fight","Signal 33 — Fire","Signal 36 — HAZMAT",
   "Signal 41 — Accident","Signal 54 — Suspicious Person/Vehicle","Signal 72 — Parking Lot Violation","Signal 92 — Gas Leak",
   "Signal 93 — Trespassing","Signal 94 — Loitering","10-37 Safety Violation","10-59 Escort"
];

/* Guard/unit status codes shown in the Unit Status dropdown (Dispatch tab) and the Units
roster — [internal STATE code, radio code + label shown to users]. The code on the left is
what's stored in units.status and referenced throughout dispatch/call logic; only the label
on the right is what guards actually see. */
var UNIT_STATUSES = [
["AVAILABLE","10-8 In Service"],
["DISPATCHED","10-12 Dispatched"],
["ENROUTE","10-75 Enroute"],
["ONSCENE","10-7 On Scene"],
["BUSY","10-6 Busy Unavailable"],
["OFFDUTY","10-10 Temp Out of Service"],
["ENDSHIFT","10-42 Off Duty"]
];
function unitStatusLabel(code){
var f = UNIT_STATUSES.find(function(s){ return s[0]===code; });
return f ? f[1] : code;
}

 var PRIORITIES = {1:"Emergency",2:"Urgent",3:"Routine",4:"Log Only"};
  var RECEIVED_VIA = ["Phone","Radio","Alarm Co.","Walk-In","Camera / CCTV","Guard App","Self-Initiated (Field)"];

 /* ---------------- state ---------------- */
 var STATE = null;
  var DB = null; // set in init() once src/db.js has loaded
 var route = (location.hash || "#dispatch").replace("#","");
  var session = null; // {callsign,name,role}
 try { session = JSON.parse(sessionStorage.getItem("cad_session")||"null"); } catch(e){}
  var uiState = { chatChannel:"all-hands", reportsTab:"incident", reportsFilter:"all", loginErr:"", pendingPin:"", selectedReport:null, consoleUnit: (session && session.defaultUnit) || "" };

 function uid(prefix){ return prefix+"-"+Math.random().toString(36).slice(2,9); }
  function nowIso(){ return new Date().toISOString(); }
  function pad(n){ return n<10?"0"+n:""+n; }

 function fmtClock(d){ d=d||new Date(); var h=d.getHours(),m=d.getMinutes(),s=d.getSeconds(); var am=h<12?"AM":"PM"; var h12=h%12; if(h12===0)h12=12; return pad(h12)+":"+pad(m)+":"+pad(s); }
  function fmtDate(d){ d=d||new Date(); var months=["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"]; var days=["SUN","MON","TUE","WED","THU","FRI","SAT"]; return days[d.getDay()]+", "+months[d.getMonth()]+" "+d.getDate(); }
                                                    function fmtDT(iso){ if(!iso) return "—"; var d=new Date(iso); var h=d.getHours(),m=d.getMinutes(); var am=h<12?"AM":"PM"; var h12=h%12; if(h12===0)h12=12; return (d.getMonth()+1)+"/"+d.getDate()+" "+pad(h12)+":"+pad(m)+" "+am; }
  function fmtShort(iso){ if(!iso) return "—"; var d=new Date(iso); return (d.getMonth()+1)+"/"+d.getDate()+" "+pad(d.getHours())+":"+pad(d.getMinutes()); }
  function fmtAgo(iso){
    if(!iso) return "";
    var ms = Date.now()-new Date(iso).getTime();
    var h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000), s=Math.floor((ms%60000)/1000);
    return pad(h)+":"+pad(m)+":"+pad(s)+" ago";
  }
  function escapeHtml(s){ return (s==null?"":String(s)).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function nl2br(s){ return escapeHtml(s||"").replace(/\n/g,"<br>"); }
  function todayCode(){ var d=new Date(); return ""+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate()); }

 /* logActivity keeps the same in-memory shape as before (newest first) so every render
  function still just reads STATE.activityLog, and queues the matching database write. */
 function logActivity(type, actorOverride, text){
   var actor = actorOverride || (session ? session.callsign : "SYSTEM");
   var entry = {at: nowIso(), type: type, actor: actor, text: text};
   STATE.activityLog.unshift(entry);
  queueWrite(function(){ return DB.activity.insert(entry); }, "activity log entry");
 }

 function currentUnit(){
   if(!session) return null;
   var u = STATE.units.find(function(x){ return x.callsign === uiState.consoleUnit; });
   if(u) return u;
   return STATE.units.find(function(x){ return x.homeCallsign === session.callsign; }) || null;
 }

 /* Sites a guard/unit is eligible to work (src/part2.js renderUnits "Assigned Sites"). Empty
  means "not restricted yet" — the app then falls back to treating every site as available,
  so existing rosters keep working until a supervisor opts a guard into specific sites. */
 function guardAssignedSiteIds(callsign){
   return (STATE.unitSites||[]).filter(function(x){return x.callsign===callsign;}).map(function(x){return x.postId;});
 }

  /* Site-scoped visibility for a signed-in GUARD: calls, truck logs, parking violations,
  guard notes, and field reports should only show records for a site the guard is assigned
  to. Returns null (no restriction) for supervisors/dispatch, and also fails open (no
  restriction) for a guard with no assigned sites yet so they are not left seeing nothing
  before assignments are configured. */
  function guardVisiblePostIds(){
    if(!session) return null;
    if(session.role==="GUARD"){
      var mine = guardAssignedSiteIds(session.callsign);
      return mine.length ? mine : null;
    }
    if(session.role==="CLIENT"){
      return session.assignedPostId ? [session.assignedPostId] : [];
    }
    return null;
  }

  /* Given a record's stored "post" string (format: "<postId> <post name>"), returns whether
  the signed-in user is allowed to see it. Always true for supervisors/dispatch. */
  function visibleToMe(post){
    var ids = guardVisiblePostIds();
    if(!ids) return true;
    if(!post) return false;
    var pid = post.split(" ")[0];
    return ids.indexOf(pid) !== -1;
  }
  /* The site a signed-in GUARD is currently working this shift (units[].post for their own
  unit) — used to auto-fill the Post/Site field when they self-initiate a call, report,
  parking violation, or truck log (src/part2.js, src/part3.js). Blank for supervisors/dispatch,
  who may be creating a record on behalf of a guard at a different site. */
 function mySitePostId(){
   if(!session) return "";
   if(session.role==="GUARD"){
     var u = currentUnit();
     return u ? (u.post||"") : "";
   }
   if(session.role==="CLIENT") return session.assignedPostId||"";
   return "";
 }

 /* Sidebar widget letting a guard pick which of their assigned sites they're working this
  shift, without navigating to the Units tab. Falls back to every site if none are assigned
  yet. Renders nothing if this guard has no linked unit record at all. */
 function renderMySitePicker(){
   var u = currentUnit();
   if(!u) return "";
   var mine = guardAssignedSiteIds(session.callsign);
   var options = mine.length ? STATE.posts.filter(function(p){return mine.indexOf(p.id)!==-1;}) : STATE.posts;
   if(!options.length) return "";
   return '<label>My Site (this shift)</label>'+
     '<div class="consoleid"><select id="mySiteSel" style="width:100%;">'+
     '<option value="">— none selected —</option>'+
     options.map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(u.post===p.id?"selected":"")+'>'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
     '</select></div>';
 }

 /* ---------------- persistence ---------------- */
 function toast(msg){
   var t = document.createElement("div");
   t.className = "toast";
   t.textContent = msg;
   document.body.appendChild(t);
   setTimeout(function(){ t.remove(); }, 2600);
 }

 var LOCAL_BACKUP_KEY = "ridgecrest_cad_backup_v1";
  function writeLocalBackup(cloudConfirmed){
    // Local safety net: this browser's own copy of STATE, independent of whether the Supabase
  // write is currently working. Never the primary store — Postgres is — but it means a failing
  // save never means a LOST entry, only an unsynced one, recoverable via the recovery banner.
  try{ localStorage.setItem(LOCAL_BACKUP_KEY, JSON.stringify({state: STATE, savedAt: Date.now(), cloudConfirmed: !!cloudConfirmed})); }catch(e){}
  }

 var pendingWrites = 0;
  /* Fire a single targeted database write for the change that was just made in memory.
  writeFn returns the Supabase promise. Retries once on a transient failure; on a
  permanent-looking failure (or if Supabase isn't configured at all) it tells the guard
  plainly that the change is only saved on this device, so it never fails silently. */
 function queueWrite(writeFn, label){
   if(!DB || !DB.configured){ writeLocalBackup(false); return; }
   pendingWrites++;
   attempt(false);
   function attempt(isRetry){
     writeFn().then(function(){
       pendingWrites = Math.max(0, pendingWrites-1);
       writeLocalBackup(pendingWrites===0);
     }).catch(function(err){
       console.warn("Supabase write failed ("+label+")", err);
       if(!isRetry){
         setTimeout(function(){ attempt(true); }, 1800 + Math.floor(Math.random()*1200));
         return;
       }
       pendingWrites = Math.max(0, pendingWrites-1);
       writeLocalBackup(false);
       toast("Couldn't save \""+label+"\" to the server — it's kept on this device. Reload later to retry.");
     });
   }
 }

 /* Call after every STATE mutation. writeFn (optional) performs the matching database write;
  omit it only for pure local/UI-only changes that don't need to be saved. */
 function persist(writeFn, label){
   render();
   if(writeFn) queueWrite(writeFn, label||"change");
   else writeLocalBackup(pendingWrites===0);
 }
  window.addEventListener("beforeunload", function(){ writeLocalBackup(pendingWrites===0); });

 /* ---------------- live location tracking ----------------
  Guards only, and only while this browser tab is open and signed in — pings the device's GPS
  on an interval and upserts it to guard_locations, which feeds the Live Map tab that Dispatch/
  Supervisors/Admins see. Never blocks or errors the rest of the app if location is denied. */
 var liveTrackTimer = null;
/* Tracked for ANY signed-in account -- Supervisor or Guard -- as long as their linked field
unit (currentUnit()) is actively working: AVAILABLE, ENROUTE, or ONSCENE. OFFDUTY units, and
any account with no linked unit at all (a pure dispatch/admin console with nothing posted to
it), are never tracked. The timer itself starts for any signed-in session and re-checks this
on every tick, so a status change (e.g. going OFFDUTY -> AVAILABLE) is picked up automatically
without needing to sign out/in again. */
var TRACKED_UNIT_STATUSES = {AVAILABLE:1, DISPATCHED:1, ENROUTE:1, ONSCENE:1};
function trackableUnit(){
var u = currentUnit();
return (u && TRACKED_UNIT_STATUSES[u.status]) ? u : null;
}
function startLiveTracking(){
if(liveTrackTimer || !session || !navigator.geolocation) return;
function ping(){
var u = trackableUnit();
if(!u || !DB || !DB.configured) return;
navigator.geolocation.getCurrentPosition(function(pos){
DB.locations.upsert(u.callsign, {lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy})
.catch(function(e){ console.warn("live location update failed", e); });
}, function(){ /* denied/unavailable this round -- quietly try again next interval */ },
{ enableHighAccuracy:true, timeout:8000, maximumAge:20000 });
}
ping();
liveTrackTimer = setInterval(ping, 45000);
}
function stopLiveTracking(){ if(liveTrackTimer){ clearInterval(liveTrackTimer); liveTrackTimer=null; } }

 /* ---------------- router / shell ---------------- */
 window.addEventListener("hashchange", function(){
   route = (location.hash||"#dispatch").replace("#","");
   render();
 });

 function nav(id){ location.hash = "#"+id; }

 function renderShell(){
   var root = document.getElementById("root");
   if(!STATE){ root.innerHTML = renderLoading(); return; }
   if(!session){
     root.innerHTML = renderLogin();
     wireLogin();
     return;
   }
   if(session.role==="CLIENT" && route!=="trucks"){ route = "trucks"; location.hash = "#trucks"; }
   var openCalls = STATE.calls.filter(function(c){ return c.status!=="CLEARED"; }).length;
   var pending = STATE.calls.filter(function(c){ return c.status==="PENDING"; }).length;
   var onDuty = STATE.units.filter(function(u){ return (u.status!=="OFFDUTY"&&u.status!=="ENDSHIFT"); });
   var avail = STATE.units.filter(function(u){ return u.status==="AVAILABLE"; });
   var statsHtml = session.role==="CLIENT" ? '' : ('<div class="stats">'+
    '<div class="stat"><div class="n">'+openCalls+'</div><div class="l">Open</div></div>'+
    '<div class="stat"><div class="n">'+pending+'</div><div class="l">Pending</div></div>'+
    '<div class="stat"><div class="n">'+avail.length+'/'+onDuty.length+'</div><div class="l">Avail</div></div>'+
    '</div>');

  root.innerHTML =
    '<div id="sidebar">'+
    '<div class="brand"><div class="mark">R</div><div><div class="name">Ridgecrest CAD</div><div class="sub">Dispatch Console</div></div></div>'+
    '<ul id="navlist">'+ NAV.filter(function(n){ return session.role==="CLIENT" ? n.id==="trucks" : (!n.supvOnly || session.role==="SUPV"); }).map(function(n){
      return '<li><button data-nav="'+n.id+'" class="'+(route===n.id?"active":"")+'"><span class="ic">'+n.ic+'</span>'+escapeHtml(n.label)+'</button></li>';
    }).join("") +'</ul>'+
    '<div class="foot">'+
    '<label>Signed In</label>'+
    '<div class="signedinbox"><div class="who"><div><div class="name">'+escapeHtml(session.name)+'</div><div class="cs">'+escapeHtml(session.callsign)+' <span class="badge-role">'+escapeHtml(session.role)+'</span></div></div></div>'+
    '<button class="signout" data-action="signout">Sign out</button></div>'+
    '<label>Console ID</label>'+
    '<div class="consoleid"><input type="text" value="'+escapeHtml(session.callsign)+'" readonly></div>'+
    (session.role==="GUARD" ? renderMySitePicker() : '')+
    '<div class="synced">'+(DB && DB.configured ? "● Synced" : "● Not connected — changes stay on this device only")+'</div>'+
    '</div>'+
    '</div>'+
    '<div id="app">'+
    '<div id="topbar">'+
    '<div class="title">Ridgecrest Threat Advisory <span class="sub">Operations Center</span></div>'+
    statsHtml+
    '<div class="clock"><div id="clockNow">'+fmtClock()+'</div><div>'+fmtDate()+'</div></div>'+
    '</div>'+
    '<div id="view"></div>'+
    '</div>';

  document.getElementById("view").innerHTML = renderView();
   wireGlobal();
   wireView();
 }

 function render(){
   renderShell();
   document.body.scrollTop = 0;
   document.documentElement.scrollTop = 0;
   window.scrollTo(0,0);
 }

 function renderView(){
   switch(route){
     case "units": return renderUnits();
     case "sites": return renderSites();
     case "tours": return renderTours();
     case "chat": return renderChat();
     case "radio": return renderRadio();
     case "trucks": return renderTrucks();
     case "parking": return renderParking();
     case "reports": return renderReports();
     case "guardnotes": return renderGuardNotes();
     case "log": return renderLog();
     case "users": return renderUsers();
     case "map": return renderMap();
     case "callhistory": return renderCallHistory();
     default: return renderDispatch();
   }
 }

 /* ---------------- loading / not-configured screens ---------------- */
 function renderLoading(){
   return '<div id="loginscreen"><div class="loginbox"><h1>Ridgecrest CAD</h1><div class="sub">'+
     (DB && DB.configured ? "Loading…" : "Supabase isn't configured yet.")+'</div>'+
     (DB && !DB.configured ? '<div class="small-muted" style="margin-top:10px;">Fill in SUPABASE_URL and SUPABASE_ANON_KEY in src/config.js, run supabase/schema.sql and supabase/seed.sql against your project, then reload.</div>' : '')+
     '</div></div>';
 }

 /* ---------------- login ---------------- */
 function renderLogin(){
  var mode = uiState.loginMode||"staff";
  if(mode==="client"){
    return '<div id="loginscreen"><div class="loginbox">'+
      '<h1>Ridgecrest CAD</h1><div class="sub">Client sign in — shipping / receiving.</div>'+
      '<label class="field"><span class="lbl">Username</span><input id="loginUser" type="text" autocomplete="username" placeholder="e.g. jsmith"></label>'+
      '<label class="field"><span class="lbl">Password</span><input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••"></label>'+
      (uiState.loginErr?'<div class="err-msg">'+escapeHtml(uiState.loginErr)+'</div>':'')+
      '<button class="btn primary" style="width:100%;margin-top:6px;" data-action="clientLogin">Sign in</button>'+
      '<div class="divider"></div>'+
      '<div class="small-muted">Guard or Supervisor? <a href="#" data-action="loginModeStaff">Sign in here</a>.</div>'+
      '</div></div>';
  }
  return '<div id="loginscreen"><div class="loginbox">'+
    '<h1>Ridgecrest CAD</h1><div class="sub">Sign in with your callsign and PIN.</div>'+
    '<label class="field"><span class="lbl">Callsign</span><select id="loginCallsign">'+
    STATE.users.filter(function(u){return u.active && u.role!=="CLIENT";}).map(function(u){ return '<option value="'+escapeHtml(u.callsign)+'">'+escapeHtml(u.callsign)+' — '+escapeHtml(u.name)+'</option>'; }).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">PIN</span><input id="loginPin" class="pinbox" type="password" maxlength="6" inputmode="numeric" placeholder="••••"></label>'+
    (uiState.loginErr?'<div class="err-msg">'+escapeHtml(uiState.loginErr)+'</div>':'')+
    '<button class="btn primary" style="width:100%;margin-top:6px;" data-action="login">Sign in</button>'+
    '<div class="divider"></div>'+
    '<div class="small-muted">Default PIN for every migrated account is <b>1234</b>. Change it immediately from Users after signing in — original PINs were not carried over from the old system for security reasons.</div>'+
    '<div class="small-muted" style="margin-top:10px;">Shipping/receiving client staff? <a href="#" data-action="loginModeClient">Sign in here</a>.</div>'+
    '</div></div>';
}

function wireLogin(){
  document.querySelectorAll("[data-action='loginModeStaff'],[data-action='loginModeClient']").forEach(function(a){
    a.addEventListener("click", function(e){
      e.preventDefault();
      uiState.loginMode = a.getAttribute("data-action")==="loginModeClient" ? "client" : "staff";
      uiState.loginErr = "";
      render();
    });
  });
  if((uiState.loginMode||"staff")==="client"){
    var cbtn = document.querySelector('[data-action="clientLogin"]');
    if(!cbtn) return;
    cbtn.addEventListener("click", function(){ doClientLogin(); });
    var passEl = document.getElementById("loginPass");
    if(passEl) passEl.addEventListener("keydown", function(e){ if(e.key==="Enter") doClientLogin(); });
    async function doClientLogin(){
      var un = (document.getElementById("loginUser").value||"").trim();
      var pw = document.getElementById("loginPass").value||"";
      var u = STATE.users.find(function(x){ return x.role==="CLIENT" && x.callsign===un; });
      if(!u || !u.active){ uiState.loginErr="Account not found."; render(); return; }
      cbtn.disabled = true; cbtn.textContent = "Signing in…";
      var ok = false;
      try{ ok = DB.configured ? await DB.auth.verifyPin(un, pw) : pw==="1234"; }
      catch(e){ uiState.loginErr="Couldn't reach the server — try again."; render(); return; }
      if(!ok){
        uiState.loginErr="Incorrect password.";
        logActivity("AUTH", un, "Failed sign-in for "+un);
        render();
        return;
      }
      uiState.loginErr="";
      session = {callsign:u.callsign, name:u.name, role:u.role, assignedPostId:u.assignedPostId||""};
      sessionStorage.setItem("cad_session", JSON.stringify(session));
      u.lastSignIn = nowIso();
      logActivity("AUTH", u.callsign, u.name+" ("+u.callsign+") signed in");
      if(DB.configured) DB.auth.recordSignIn(u.callsign).catch(function(e){ console.warn("record_sign_in failed", e); });
      render();
    }
    return;
  }
  var btn = document.querySelector('[data-action="login"]');
  btn.addEventListener("click", function(){ doLogin(); });
  document.getElementById("loginPin").addEventListener("keydown", function(e){ if(e.key==="Enter") doLogin(); });
  async function doLogin(){
    var cs = document.getElementById("loginCallsign").value;
    var pin = document.getElementById("loginPin").value;
    var u = STATE.users.find(function(x){ return x.callsign===cs; });
    if(!u || !u.active){ uiState.loginErr="Account not found."; render(); return; }
    btn.disabled = true; btn.textContent = "Signing in…";
    var ok = false;
    try{ ok = DB.configured ? await DB.auth.verifyPin(cs, pin) : pin==="1234"; }
    catch(e){ uiState.loginErr="Couldn't reach the server — try again."; render(); return; }
    if(!ok){
      uiState.loginErr="Incorrect PIN.";
      logActivity("AUTH", cs, "Failed sign-in for "+cs);
      render();
      return;
    }
    uiState.loginErr="";
    session = {callsign:u.callsign, name:u.name, role:u.role, assignedPostId:u.assignedPostId||""};
    sessionStorage.setItem("cad_session", JSON.stringify(session));
    u.lastSignIn = nowIso();
    logActivity("AUTH", u.callsign, u.name+" ("+u.callsign+") signed in");
    if(DB.configured) DB.auth.recordSignIn(u.callsign).catch(function(e){ console.warn("record_sign_in failed", e); });
    startLiveTracking();
    render();
  }
 }
function wireGlobal(){
   document.querySelectorAll("[data-nav]").forEach(function(b){
     b.addEventListener("click", function(){ nav(b.getAttribute("data-nav")); });
   });
   var so = document.querySelector('[data-action="signout"]');
   if(so) so.addEventListener("click", function(){
     logActivity("AUTH", session.callsign, session.name+" signed out");
     stopLiveTracking();
     session = null;
     sessionStorage.removeItem("cad_session");
     render();
   });
   var mySiteSel = document.getElementById("mySiteSel");
   if(mySiteSel) mySiteSel.addEventListener("change", function(){
     var u = currentUnit();
     if(!u) return;
     var from = u.post;
     u.post = mySiteSel.value;
     logActivity("UNIT", session.callsign, session.name+" set their shift site to "+(u.post||"none")+(from?" (was "+from+")":""));
     persist(function(){ return DB.units.update(u.callsign, {post:u.post}); }, "shift site for "+u.callsign);
   });
   setInterval(function(){
     var c = document.getElementById("clockNow");
     if(c) c.textContent = fmtClock();
   }, 1000);
 }

 function wireView(){
   if(route==="dispatch") wireDispatch();
   if(route==="units") wireUnits();
   if(route==="sites") wireSites();
   if(route==="tours") wireTours();
   if(route==="chat") wireChat();
   if(route==="trucks") wireTrucks();
   if(route==="parking") wireParking();
   if(route==="reports") wireReports();
   if(route==="guardnotes") wireGuardNotes();
   if(route==="log") wireLog();
   if(route==="users") wireUsers();
   if(route==="map") wireMap();
   if(route==="callhistory") wireCallHistory();
 }

 /* app.js continues in part2.js / part3.js, appended below via the build step */
 window.__CAD = {
   STATE:STATE, uid:uid, nowIso:nowIso, fmtDT:fmtDT, fmtShort:fmtShort, fmtAgo:fmtAgo, escapeHtml:escapeHtml, nl2br:nl2br,
   logActivity:logActivity, persist:persist, toast:toast, render:render, nav:nav,
   get session(){return session;}, set session(v){session=v;},
   uiState:uiState, NAV:NAV, REPORT_TYPES:REPORT_TYPES, VIOLATION_TYPES:VIOLATION_TYPES, ACTION_TAKEN_OPTS:ACTION_TAKEN_OPTS,
   CALL_CODES:CALL_CODES, PRIORITIES:PRIORITIES, RECEIVED_VIA:RECEIVED_VIA, currentUnit:currentUnit, todayCode:todayCode, pad:pad,
   UNIT_TYPES:UNIT_TYPES, mySitePostId:mySitePostId, guardAssignedSiteIds:guardAssignedSiteIds,
 UNIT_STATUSES:UNIT_STATUSES, unitStatusLabel:unitStatusLabel
 };

 /* ---------------- init ---------------- */
 function checkLocalBackup(){
   var backup = null;
   try{
     var raw = localStorage.getItem(LOCAL_BACKUP_KEY);
     if(raw) backup = JSON.parse(raw);
   }catch(e){ return; }
   if(!backup || !backup.state || backup.cloudConfirmed) return;
   var banner = document.getElementById("recoveryBanner");
   if(!banner) return;
   var when = new Date(backup.savedAt);
   var hh = String(when.getHours()).padStart(2,"0"), mm = String(when.getMinutes()).padStart(2,"0");
   banner.innerHTML = "This browser has entries from " + hh + ":" + mm + " that may not have saved to the server. " +
     '<button id="recoverRestoreBtn" class="btn sm primary" style="margin-left:10px;">Restore them</button>' +
     '<button id="recoverDiscardBtn" class="btn sm" style="margin-left:6px;">Discard</button>';
   banner.style.display = "flex";
   document.getElementById("recoverRestoreBtn").addEventListener("click", function(){
     toast("Restoring — re-saving each recovered entry to the server…");
     var restored = backup.state;
     // Re-submit every row from the recovered snapshot that isn't already in the freshly-loaded
                                                                 // STATE, so a save that failed mid-flight gets pushed to Supabase now that it's reachable.
                                                                 if(DB && DB.configured){
                                                                   var haveCallIds = {}; STATE.calls.forEach(function(c){haveCallIds[c.id]=1;});
                                                                   (restored.calls||[]).forEach(function(c){ if(!haveCallIds[c.id]){ STATE.calls.unshift(c); queueWrite(function(){return DB.calls.insert(c);}, "call "+c.id); } });
                                                                   var haveUnitCs = {}; STATE.units.forEach(function(u){haveUnitCs[u.callsign]=1;});
                                                                   (restored.units||[]).forEach(function(u){ if(!haveUnitCs[u.callsign]){ STATE.units.push(u); queueWrite(function(){return DB.units.insert(u);}, "unit "+u.callsign); } });
                                                                   var havePv = {}; STATE.parkingViolations.forEach(function(v){havePv[v.id]=1;});
                                                                   (restored.parkingViolations||[]).forEach(function(v){ if(!havePv[v.id]){ STATE.parkingViolations.unshift(v); queueWrite(function(){return DB.parking.insert(v);}, "parking violation "+v.id); } });
                                                                   var haveR = {}; STATE.reports.forEach(function(r){haveR[r.id]=1;});
                                                                   (restored.reports||[]).forEach(function(r){ if(!haveR[r.id]){ STATE.reports.unshift(r); queueWrite(function(){return DB.reports.insert(r);}, "report "+r.id); } });

     var haveT = {}; STATE.trucks.forEach(function(t){haveT[t.id]=1;});
                                                                   (restored.trucks||[]).forEach(function(t){ if(!haveT[t.id]){ STATE.trucks.unshift(t); queueWrite(function(){return DB.trucks.insert(t);}, "truck "+t.id); } });
                                                                   var haveP = {}; STATE.policeOnProperty.forEach(function(p){haveP[p.id]=1;});
                                                                   (restored.policeOnProperty||[]).forEach(function(p){ if(!haveP[p.id]){ STATE.policeOnProperty.unshift(p); queueWrite(function(){return DB.police.insert(p);}, "police on property "+p.id); } });
                                                                   var haveN = {}; STATE.guardNotes.forEach(function(n){haveN[n.id]=1;});
                                                                   (restored.guardNotes||[]).forEach(function(n){ if(!haveN[n.id]){ STATE.guardNotes.unshift(n); queueWrite(function(){return DB.guardNotes.insert(n);}, "guard note "+n.id); } });
                                                                   var haveMsg = {}; STATE.chat.messages.forEach(function(m){haveMsg[m.channel+"|"+m.at]=1;});
                                                                   (restored.chat&&restored.chat.messages||[]).forEach(function(m){ var k=m.channel+"|"+m.at; if(!haveMsg[k]){ STATE.chat.messages.push(m); queueWrite(function(){return DB.chat.addMessage(m);}, "chat message"); } });
                                                                 } else {
                                                                   STATE = restored;
                                                                 }
     try{ localStorage.removeItem(LOCAL_BACKUP_KEY); }catch(e){}
     banner.style.display = "none";
     render();
   });
   document.getElementById("recoverDiscardBtn").addEventListener("click", function(){
     try{ localStorage.removeItem(LOCAL_BACKUP_KEY); }catch(e){}
     banner.style.display = "none";
   });
 }

 async function init(){
   DB = window.__CAD_DB;
   window.__CAD.DB = DB;
   render(); // loading screen
  if(!DB || !DB.configured){ render(); checkLocalBackup(); return; }
   try{
     STATE = await DB.loadAllState();
   }catch(e){
     console.error("Failed to load state from Supabase", e);
     document.getElementById("root").innerHTML = '<div id="loginscreen"><div class="loginbox"><h1>Ridgecrest CAD</h1>'+
       '<div class="sub">Couldn\'t reach the database.</div><div class="small-muted" style="margin-top:10px;">'+escapeHtml(String(e.message||e))+'</div>'+
       '<button class="btn primary" style="width:100%;margin-top:14px;" onclick="location.reload()">Retry</button></div></div>';
     return;
   }
   window.__CAD.STATE = STATE;
   render();
   checkLocalBackup();
   startLiveTracking();
   var realtimeTimer = null;
   DB.subscribeRealtime(function(){
     // Another guard's session changed something. Refetch everything (simple and infrequent enough
                        // to be cheap) but debounce a burst of events into one refresh, and never yank the screen out
                        // from under someone mid-typing — apply the fresh state but skip the re-render until they're done.
                        if(realtimeTimer) clearTimeout(realtimeTimer);
     realtimeTimer = setTimeout(function(){
       DB.loadAllState().then(function(fresh){
         STATE = fresh; window.__CAD.STATE = STATE;

                              // Pick up role/map-access changes made to this account from elsewhere (e.g. a dispatcher
                              // changing this supervisor's assigned site) without requiring a fresh sign-in.
                              if(session){
                                var me = STATE.users.find(function(u){ return u.callsign===session.callsign; });
                                if(me){
                                  var changed = session.role!==me.role || session.name!==me.name || session.assignedPostId!==(me.assignedPostId||"");
                                  session.role = me.role; session.name = me.name; session.assignedPostId = me.assignedPostId||"";
                                  if(changed) sessionStorage.setItem("cad_session", JSON.stringify(session));
                                }
                              }
         var active = document.activeElement, tag = active && active.tagName;
         if(tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT") return; // apply silently; next render will pick it up
                              render();
       }).catch(function(e){ console.warn("realtime refresh failed", e); });
     }, 700);
   });
 }
  document.addEventListener("DOMContentLoaded", init);
})();
