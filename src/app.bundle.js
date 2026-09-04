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
  {id:"map", label:"Live Map", ic:"◎", supvOnly:true}
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
  "10-05 Unsecured Door / Window","10-07 Parking Violation BOLO","10-08L Patrol Tour","10-19 Shift Change",
  "10-31 Trespass / Unwanted Person","10-41 Access Control Issue","10-41 Monitoring Exit Only","10-52 Medical Emergency / EMS Needed",
  "10-62 Intrusion Alarm Activation","10-99 Monitor Exit Only"
];

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
function startLiveTracking(){
  if(liveTrackTimer || !session || session.role!=="GUARD" || !navigator.geolocation) return;
  function ping(){
    if(!session || session.role!=="GUARD" || !DB || !DB.configured) return;
    navigator.geolocation.getCurrentPosition(function(pos){
      DB.locations.upsert(session.callsign, {lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy})
        .catch(function(e){ console.warn("live location update failed", e); });
    }, function(){ /* denied/unavailable this round — quietly try again next interval */ },
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
  var openCalls = STATE.calls.filter(function(c){ return c.status!=="CLEARED"; }).length;
  var pending = STATE.calls.filter(function(c){ return c.status==="PENDING"; }).length;
  var onDuty = STATE.units.filter(function(u){ return u.status!=="OFFDUTY"; });
  var avail = STATE.units.filter(function(u){ return u.status==="AVAILABLE"; });

  root.innerHTML =
    '<div id="sidebar">'+
      '<div class="brand"><div class="mark">R</div><div><div class="name">Ridgecrest CAD</div><div class="sub">Dispatch Console</div></div></div>'+
      '<ul id="navlist">'+ NAV.filter(function(n){ return !n.supvOnly || session.role==="SUPV"; }).map(function(n){
        return '<li><button data-nav="'+n.id+'" class="'+(route===n.id?"active":"")+'"><span class="ic">'+n.ic+'</span>'+escapeHtml(n.label)+'</button></li>';
      }).join("") +'</ul>'+
      '<div class="foot">'+
        '<label>Signed In</label>'+
        '<div class="signedinbox"><div class="who"><div><div class="name">'+escapeHtml(session.name)+'</div><div class="cs">'+escapeHtml(session.callsign)+' <span class="badge-role">'+escapeHtml(session.role)+'</span></div></div></div>'+
        '<button class="signout" data-action="signout">Sign out</button></div>'+
        '<label>Console ID</label>'+
        '<div class="consoleid"><input type="text" value="'+escapeHtml(session.callsign)+'" readonly></div>'+
        '<div class="synced">'+(DB && DB.configured ? "● Synced" : "● Not connected — changes stay on this device only")+'</div>'+
      '</div>'+
    '</div>'+
    '<div id="app">'+
      '<div id="topbar">'+
        '<div class="title">Ridgecrest Threat Advisory <span class="sub">Operations Center</span></div>'+
        '<div class="stats">'+
          '<div class="stat"><div class="n">'+openCalls+'</div><div class="l">Open</div></div>'+
          '<div class="stat"><div class="n">'+pending+'</div><div class="l">Pending</div></div>'+
          '<div class="stat"><div class="n">'+avail.length+'/'+onDuty.length+'</div><div class="l">Avail</div></div>'+
          '<div class="clock"><div id="clockNow">'+fmtClock()+'</div><div>'+fmtDate()+'</div></div>'+
        '</div>'+
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
  return '<div id="loginscreen"><div class="loginbox">'+
    '<h1>Ridgecrest CAD</h1><div class="sub">Sign in with your callsign and PIN.</div>'+
    '<label class="field"><span class="lbl">Callsign</span><select id="loginCallsign">'+
      STATE.users.filter(function(u){return u.active;}).map(function(u){ return '<option value="'+escapeHtml(u.callsign)+'">'+escapeHtml(u.callsign)+' — '+escapeHtml(u.name)+'</option>'; }).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">PIN</span><input id="loginPin" class="pinbox" type="password" maxlength="6" inputmode="numeric" placeholder="••••"></label>'+
    (uiState.loginErr? '<div class="err-msg">'+escapeHtml(uiState.loginErr)+'</div>':'')+
    '<button class="btn primary" style="width:100%;margin-top:6px;" data-action="login">Sign in</button>'+
    '<div class="divider"></div>'+
    '<div class="small-muted">Default PIN for every migrated account is <b>1234</b>. Change it immediately from Users after signing in — original PINs were not carried over from the old system for security reasons.</div>'+
  '</div></div>';
}
function wireLogin(){
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

/* ---------------- global wiring ---------------- */
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
}

/* app.js continues in part2.js / part3.js, appended below via the build step */
window.__CAD = {
  STATE:STATE, uid:uid, nowIso:nowIso, fmtDT:fmtDT, fmtShort:fmtShort, fmtAgo:fmtAgo, escapeHtml:escapeHtml, nl2br:nl2br,
  logActivity:logActivity, persist:persist, toast:toast, render:render, nav:nav,
  get session(){return session;}, set session(v){session=v;},
  uiState:uiState, NAV:NAV, REPORT_TYPES:REPORT_TYPES, VIOLATION_TYPES:VIOLATION_TYPES, ACTION_TAKEN_OPTS:ACTION_TAKEN_OPTS,
  CALL_CODES:CALL_CODES, PRIORITIES:PRIORITIES, RECEIVED_VIA:RECEIVED_VIA, currentUnit:currentUnit, todayCode:todayCode, pad:pad,
  UNIT_TYPES:UNIT_TYPES
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
/* ---------------- DISPATCH ---------------- */
function renderDispatch(){
  var C = window.__CAD;
  var queue = STATE.calls.filter(function(c){ return c.status!=="CLEARED"; }).sort(function(a,b){ return a.priority-b.priority || new Date(a.createdAt)-new Date(b.createdAt); });
  var html = '<div class="three-col">';

  // New call intake
  html += '<div class="card"><div class="section-head"><h2>New Call Intake</h2><span class="pill blue">'+escapeHtml(session.callsign)+'</span></div>'+
    '<form id="callForm">'+
    '<label class="field"><span class="lbl">Incident Code</span><select name="code"><option value="">Select code…</option>'+
      C.CALL_CODES.map(function(c){ return '<option value="'+escapeHtml(c)+'">'+escapeHtml(c)+'</option>'; }).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Type / Nature</span><input type="text" name="nature" placeholder="Auto-filled from code — edit as needed"></label>'+
    '<label class="field"><span class="lbl">Priority</span><div class="priobtns" id="prioBtns">'+
      [1,2,3,4].map(function(p){ return '<button type="button" data-p="'+p+'" class="'+(p===3?"active":"")+'">P'+p+'</button>'; }).join("")+
    '</div></label>'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">Select post…</option>'+
      STATE.posts.map(function(p){ return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Exact Location</span><input type="text" name="location" placeholder="Floor, zone, door, lot…"></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Reporting Party</span><input type="text" name="rp" placeholder="Name"></label>'+
    '<label class="field"><span class="lbl">Callback</span><input type="text" name="callback" placeholder="Phone"></label></div>'+
    '<label class="field"><span class="lbl">Received Via</span><div class="via-grid" id="viaGrid">'+
      C.RECEIVED_VIA.map(function(v,i){ return '<button type="button" data-via="'+escapeHtml(v)+'" class="'+(i===0?"active":"")+'">'+escapeHtml(v)+'</button>'; }).join("")+
    '</div></label>'+
    '<div style="display:flex;gap:8px;margin-top:12px;"><button type="submit" class="btn primary" style="flex:1;">Create call</button><button type="button" class="btn ghost" data-action="clearIntake">Clear</button></div>'+
    '</form></div>';

  // Active queue
  html += '<div class="card"><div class="section-head"><h2>Active Queue <span class="meta">'+queue.length+'</span></h2></div>';
  if(queue.length===0){
    html += '<div class="empty-state">Queue is clear.<br>No open calls. New intake appears here immediately.</div>';
  } else {
    html += queue.map(function(c){
      return '<div class="list-item" data-open-call="'+c.id+'">'+
        '<div class="top"><span>#'+c.id+' · P'+c.priority+' '+escapeHtml(c.code||"")+'</span><span>'+fmtShort(c.createdAt)+'</span></div>'+
        '<div class="subj">'+escapeHtml(c.nature||c.code||"")+'</div>'+
        '<div class="meta">@ '+escapeHtml(c.post||"—")+' · <span class="pill '+(c.status==="DISPATCHED"?"blue":c.status==="ONSCENE"?"ok":"muted")+'">'+c.status+'</span>'+(c.assignedUnit?" · "+escapeHtml(c.assignedUnit):"")+'</div>'+
      '</div>';
    }).join("");
  }
  html += '</div>';

  // Unit status
  html += '<div class="card"><div class="section-head"><h2>Unit Status</h2><span class="meta">'+STATE.units.filter(function(u){return u.status!=="OFFDUTY";}).length+' on duty</span></div>';
  ["AVAILABLE","DISPATCHED","ONSCENE","OFFDUTY"].forEach(function(st){
    var us = STATE.units.filter(function(u){ return u.status===st; });
    if(!us.length) return;
    html += '<div class="small-muted" style="margin:10px 0 4px;text-transform:uppercase;letter-spacing:.05em;">'+st+' ('+us.length+')</div>';
    html += us.map(function(u){
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid hsl(var(--border)/.5);">'+
        '<div><div style="font-weight:600;">'+escapeHtml(u.callsign)+' '+escapeHtml(u.name)+'</div><div class="small-muted">'+escapeHtml(u.type)+' · '+escapeHtml(u.post||"")+' · '+escapeHtml(u.shift||"")+'</div></div>'+
        '<select class="unitStatusSel" data-unit="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:11px;padding:4px 6px;">'+
          ["AVAILABLE","DISPATCHED","ONSCENE","OFFDUTY"].map(function(s){ return '<option value="'+s+'" '+(s===u.status?"selected":"")+'>'+s+'</option>'; }).join("")+
        '</select></div>';
    }).join("");
  });
  html += '<div class="small-muted" style="margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em;">Live Log</div><div style="max-height:260px;overflow-y:auto;">';
  html += STATE.activityLog.slice(0,12).map(function(l){
    return '<div style="padding:5px 0;border-bottom:1px solid hsl(var(--border)/.4);font-size:11px;"><span class="small-muted">'+fmtShort(l.at)+'</span> '+escapeHtml(l.text)+'</div>';
  }).join("");
  html += '</div></div>';

  html += '</div>';

  if(uiState.openCallId){
    var oc = STATE.calls.find(function(c){ return c.id===uiState.openCallId; });
    if(oc) html += renderCallModal(oc);
  }
  return html;
}

function renderCallModal(c){
  var C=window.__CAD;
  var narr = (c.narrativeSupplements||[]).map(function(n){ return '<div style="margin-bottom:6px;"><span class="small-muted">'+fmtShort(n.at)+' '+escapeHtml(n.by)+':</span> '+escapeHtml(n.text)+'</div>'; }).join("") || '<div class="small-muted">No supplements yet.</div>';
  return '<div class="modal-backdrop" data-close-modal="1"><div class="modal" onclick="event.stopPropagation()">'+
    '<button class="close" data-action="closeCall">✕</button>'+
    '<div class="rtaid">#'+c.id+'</div><h2>'+escapeHtml(c.nature||c.code||"")+'</h2>'+
    '<div class="kv-grid">'+
      '<div><div class="k">Priority</div><div class="v">P'+c.priority+' — '+C.PRIORITIES[c.priority]+'</div></div>'+
      '<div><div class="k">Status</div><div class="v">'+c.status+'</div></div>'+
      '<div><div class="k">Post</div><div class="v">'+escapeHtml(c.post||"—")+'</div></div>'+
      '<div><div class="k">Location</div><div class="v">'+escapeHtml(c.location||"—")+'</div></div>'+
      '<div><div class="k">Created</div><div class="v">'+fmtDT(c.createdAt)+'</div></div>'+
      '<div><div class="k">Unit</div><div class="v">'+escapeHtml(c.assignedUnit||"Unassigned")+'</div></div>'+
    '</div>'+
    '<div class="field-block"><div class="k">Narrative Supplements</div>'+narr+'</div>'+
    '<label class="field"><span class="lbl">Add supplement</span><textarea id="callSupp" rows="2"></textarea></label>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
      '<button class="btn sm" data-action="addSupp" data-call="'+c.id+'">Add note</button>'+
      '<button class="btn sm" data-action="dispatchUnit" data-call="'+c.id+'">Dispatch unit</button>'+
      '<button class="btn sm ok" data-action="callStatus" data-call="'+c.id+'" data-to="ONSCENE">On scene</button>'+
      '<button class="btn sm destructive" data-action="callStatus" data-call="'+c.id+'" data-to="CLEARED">Clear call</button>'+
    '</div>'+
  '</div></div>';
}

function wireDispatch(){
  var form = document.getElementById("callForm");
  var selectedPrio = 3, selectedVia = window.__CAD.RECEIVED_VIA[0];
  document.querySelectorAll("#prioBtns button").forEach(function(b){
    b.addEventListener("click", function(){ selectedPrio=+b.getAttribute("data-p"); document.querySelectorAll("#prioBtns button").forEach(function(x){x.classList.remove("active");}); b.classList.add("active"); });
  });
  document.querySelectorAll("#viaGrid button").forEach(function(b){
    b.addEventListener("click", function(){ selectedVia=b.getAttribute("data-via"); document.querySelectorAll("#viaGrid button").forEach(function(x){x.classList.remove("active");}); b.classList.add("active"); });
  });
  var codeSel = form.querySelector('[name="code"]');
  codeSel.addEventListener("change", function(){ if(!form.querySelector('[name="nature"]').value) form.querySelector('[name="nature"]').value = codeSel.value; });
  form.addEventListener("submit", async function(e){
    e.preventDefault();
    var fd = new FormData(form);
    var postId = fd.get("post");
    var post = STATE.posts.find(function(p){return p.id===postId;});
    // Atomic server-side counter when connected, so two guards creating calls at the same
    // moment never collide on the same ID (a real risk once this isn't single-writer anymore).
    var seq = DB.configured ? await DB.counters.next("call").catch(function(){ return (STATE.callSeq||0)+1; }) : (STATE.callSeq||0)+1;
    STATE.callSeq = seq;
    var id = window.__CAD.todayCode()+"-"+String(seq).padStart(4,"0");
    var call = {
      id:id, code:fd.get("code")||"", nature:fd.get("nature")||fd.get("code")||"", priority:selectedPrio,
      post: postId ? (postId+" "+post.name) : "", location: fd.get("location")||"", reportingParty: fd.get("rp")||"",
      callback: fd.get("callback")||"", receivedVia: selectedVia, status:"PENDING", createdAt: nowIso(),
      assignedUnit:"", narrativeSupplements:[]
    };
    STATE.calls.unshift(call);
    logActivity("INCIDENT", "DISPATCH", "CALL CREATED "+id+" — P"+selectedPrio+" "+(call.code||call.nature)+(call.post?" @ "+call.post:""));
    form.reset();
    persist(function(){ return DB.calls.insert(call); }, "call "+id);
  });
  var clearBtn = document.querySelector('[data-action="clearIntake"]');
  if(clearBtn) clearBtn.addEventListener("click", function(){ form.reset(); });

  document.querySelectorAll("[data-open-call]").forEach(function(el){
    el.addEventListener("click", function(){ uiState.openCallId = el.getAttribute("data-open-call"); render(); });
  });
  var backdrop = document.querySelector("[data-close-modal]");
  if(backdrop) backdrop.addEventListener("click", function(){ uiState.openCallId=null; render(); });
  var closeBtn = document.querySelector('[data-action="closeCall"]');
  if(closeBtn) closeBtn.addEventListener("click", function(){ uiState.openCallId=null; render(); });
  var suppBtn = document.querySelector('[data-action="addSupp"]');
  if(suppBtn) suppBtn.addEventListener("click", function(){
    var id = suppBtn.getAttribute("data-call"); var c = STATE.calls.find(function(x){return x.id===id;});
    var txt = document.getElementById("callSupp").value.trim();
    if(!txt) return;
    c.narrativeSupplements = c.narrativeSupplements||[];
    var supp = {at:nowIso(), by:session.callsign, text:txt};
    c.narrativeSupplements.push(supp);
    logActivity("INCIDENT", session.callsign, "Narrative supplement on "+id+": "+txt);
    persist(function(){ return DB.calls.addSupplement(id, supp); }, "supplement on "+id);
  });
  document.querySelectorAll('[data-action="callStatus"]').forEach(function(b){
    b.addEventListener("click", function(){
      var id=b.getAttribute("data-call"); var to=b.getAttribute("data-to");
      var c=STATE.calls.find(function(x){return x.id===id;});
      var from=c.status; c.status=to;
      logActivity("INCIDENT", session.callsign, id+" status "+from+" → "+to);
      if(to==="CLEARED") uiState.openCallId=null;
      persist(function(){ return DB.calls.update(id, {status:to}); }, "call "+id+" status");
    });
  });
  var dispBtn = document.querySelector('[data-action="dispatchUnit"]');
  if(dispBtn) dispBtn.addEventListener("click", function(){
    var id = dispBtn.getAttribute("data-call"); var c=STATE.calls.find(function(x){return x.id===id;});
    var avail = STATE.units.find(function(u){ return u.status==="AVAILABLE"; });
    if(!avail){ toast("No available units."); return; }
    avail.status="DISPATCHED"; avail.statusSince=nowIso();
    c.assignedUnit = avail.callsign; c.status="DISPATCHED";
    logActivity("INCIDENT", session.callsign, "Unit "+avail.callsign+" dispatched to "+id);
    logActivity("UNIT", "DISPATCH", "Unit "+avail.callsign+" status AVAILABLE → DISPATCHED");
    persist(function(){ return Promise.all([
      DB.calls.update(id, {status:"DISPATCHED", assigned_unit:avail.callsign}),
      DB.units.update(avail.callsign, {status:"DISPATCHED", status_since:avail.statusSince})
    ]); }, "dispatch to "+id);
  });
  document.querySelectorAll(".unitStatusSel").forEach(function(sel){
    sel.addEventListener("change", function(){
      var cs=sel.getAttribute("data-unit"); var u=STATE.units.find(function(x){return x.callsign===cs;});
      var from=u.status; u.status=sel.value; u.statusSince=nowIso();
      logActivity("UNIT","DISPATCH","Unit "+cs+" status "+from+" → "+sel.value);
      persist(function(){ return DB.units.update(cs, {status:u.status, status_since:u.statusSince}); }, "unit "+cs+" status");
    });
  });
}

/* ---------------- UNITS ---------------- */
function renderUnits(){
  var C = window.__CAD;
  var onDuty = STATE.units.filter(function(u){return u.status!=="OFFDUTY";}).length;
  var html = '<div class="card"><div class="section-head"><h2>Guard &amp; Unit Roster</h2><span class="meta">'+onDuty+' on duty / '+STATE.units.length+' total</span></div>'+
    '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn sm primary" data-action="addUnit">+ Add unit</button></div>'+
    '<table class="datatable"><thead><tr><th>Callsign</th><th>Guard</th><th>Type</th><th>Status</th><th>Since</th><th>Post</th><th>Shift</th><th></th></tr></thead><tbody>'+
    STATE.units.map(function(u){
      return '<tr><td class="mono">'+escapeHtml(u.callsign)+'</td><td>'+escapeHtml(u.name)+'</td>'+
        '<td><select class="unitTypeSel" data-unit="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:12px;padding:4px 6px;">'+
          C.UNIT_TYPES.map(function(t){ return '<option value="'+escapeHtml(t)+'" '+(t===u.type?"selected":"")+'>'+escapeHtml(t)+'</option>'; }).join("")+
          (C.UNIT_TYPES.indexOf(u.type)===-1 && u.type ? '<option value="'+escapeHtml(u.type)+'" selected>'+escapeHtml(u.type)+'</option>' : '')+
        '</select></td>'+
        '<td><span class="pill '+(u.status==="AVAILABLE"?"ok":u.status==="OFFDUTY"?"muted":"blue")+'">'+u.status+'</span></td>'+
        '<td class="mono small-muted">'+fmtAgo(u.statusSince)+'</td><td>'+escapeHtml(u.post||"—")+'</td><td>'+escapeHtml(u.shift||"—")+'</td>'+
        '<td><button class="btn sm ghost" data-remove-unit="'+escapeHtml(u.callsign)+'">Remove</button></td></tr>';
    }).join("") + '</tbody></table></div>';
  return html;
}
function wireUnits(){
  var addBtn = document.querySelector('[data-action="addUnit"]');
  if(addBtn) addBtn.addEventListener("click", function(){
    var cs = prompt("Callsign (e.g. S-62)"); if(!cs) return;
    var name = prompt("Guard name")||"";
    var u = {callsign:cs, name:name, type:"Foot Post", status:"OFFDUTY", statusSince:nowIso(), post:STATE.posts[0]?STATE.posts[0].id:"", shift:"Shift A", homeCallsign:""};
    STATE.units.push(u);
    logActivity("UNIT","DISPATCH","Unit "+cs+" ("+name+") added to roster");
    persist(function(){ return DB.units.insert(u); }, "unit "+cs);
  });
  document.querySelectorAll(".unitTypeSel").forEach(function(sel){
    sel.addEventListener("change", function(){
      var cs=sel.getAttribute("data-unit"); var u=STATE.units.find(function(x){return x.callsign===cs;});
      var from=u.type; u.type=sel.value;
      logActivity("UNIT", session?session.callsign:"DISPATCH", "Unit "+cs+" type changed "+(from?from+" → ":"")+sel.value);
      persist(function(){ return DB.units.update(cs, {type:u.type}); }, "unit "+cs+" type");
    });
  });
  document.querySelectorAll("[data-remove-unit]").forEach(function(b){
    b.addEventListener("click", function(){
      var cs=b.getAttribute("data-remove-unit");
      if(!confirm("Remove unit "+cs+"?")) return;
      STATE.units = STATE.units.filter(function(u){return u.callsign!==cs;});
      logActivity("UNIT","DISPATCH","Unit "+cs+" removed from roster");
      persist(function(){ return DB.units.remove(cs); }, "unit "+cs+" removal");
    });
  });
}

/* ---------------- SITES ---------------- */
// Sites are the security posts/locations themselves. Patrol Tours — the walkable, ordered
// routes of scan points a supervisor builds live and assigns to guards — are a separate concept
// with their own nav tab (renderTours/wireTours in part3.js); one site can have many tours. This
// view is just the site directory now; the old per-checkpoint scan UI moved to Patrol Tours.
function renderSites(){
  var html = '<div class="card"><div class="section-head"><h2>Site Directory</h2><span class="meta">'+STATE.posts.length+' sites</span></div>';
  if(!STATE.posts.length){
    html += '<div class="empty-state">No sites yet.</div>';
  } else {
    html += STATE.posts.map(function(p){
      var tourCount = (STATE.patrolTours||[]).filter(function(t){return t.postId===p.id && t.active;}).length;
      return '<div class="list-item">'+
        '<div class="top"><span><b>'+escapeHtml(p.id)+'</b> — '+escapeHtml(p.name)+'</span><span class="pill blue">'+escapeHtml(p.kind)+'</span></div>'+
        '<div class="meta">'+escapeHtml(p.org)+' · '+escapeHtml(p.address||"No address on file")+'</div>'+
        '<div class="small-muted" style="margin-top:4px;">'+tourCount+' active patrol tour'+(tourCount===1?"":"s")+' — see Patrol Tours</div>'+
      '</div>';
    }).join("");
  }
  html += '</div>';
  return html;
}
/* Reads the device's current GPS position. Never rejects — resolves null on denial/timeout/no
   support — so a scan (or, in Patrol Tours, capturing a new point) is never blocked by a
   guard's or supervisor's location settings. */
function getGeo(){
  return new Promise(function(resolve){
    if(!navigator.geolocation){ resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      function(pos){ resolve({lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy}); },
      function(){ resolve(null); },
      { enableHighAccuracy:true, timeout:10000, maximumAge:30000 }
    );
  });
}

function wireSites(){
  // Plain directory — nothing to wire yet.
}

/* ---------------- PATROL CHAT ---------------- */
function renderChat(){
  var ch = STATE.chat.channels.find(function(c){return c.id===uiState.chatChannel;}) || STATE.chat.channels[0];
  var msgs = STATE.chat.messages.filter(function(m){return m.channel===ch.id;});
  var activeBolo = STATE.chat.messages.filter(function(m){return m.bolo;}).length;
  var onDuty = STATE.units.filter(function(u){return u.status!=="OFFDUTY";});
  var html = '<div class="section-head"><h2>Patrol Chat</h2><span class="meta">'+onDuty.length+' on duty · '+STATE.chat.channels.length+' channels'+(activeBolo?' · <span style="color:hsl(var(--destructive));">⚠ '+activeBolo+' active BOLO</span>':'')+'</span></div>';
  html += '<div class="two-col">';
  html += '<div class="card"><div class="small-muted" style="margin-bottom:6px;text-transform:uppercase;">Channels</div>'+
    STATE.chat.channels.map(function(c){ return '<button class="btn ghost sm" data-chan="'+c.id+'" style="width:100%;justify-content:flex-start;margin-bottom:2px;'+(c.id===ch.id?'background:hsl(var(--accent));':'')+'">#'+escapeHtml(c.name)+'</button>'; }).join("")+
    '<div class="divider"></div><div style="display:flex;gap:6px;"><input id="newChanName" type="text" placeholder="New channel"><button class="btn sm" data-action="addChan">Add</button></div>'+
    '<div class="small-muted" style="margin-top:14px;text-transform:uppercase;">On Duty</div>'+
    onDuty.map(function(u){ return '<div style="padding:4px 0;">● '+escapeHtml(u.callsign)+' '+escapeHtml(u.name)+'</div>'; }).join("")+
  '</div>';
  html += '<div class="card"><div style="font-weight:700;">#'+escapeHtml(ch.name)+'</div><div class="small-muted" style="margin-bottom:10px;">'+escapeHtml(ch.desc||"")+' · '+msgs.length+' messages</div>'+
    '<div id="chatMsgs" style="max-height:420px;overflow-y:auto;margin-bottom:12px;">'+
    (msgs.length? msgs.map(function(m){
      return '<div class="chat-msg'+(m.bolo?' bolo':'')+'"><div class="head"><span><span class="from">'+escapeHtml(m.from)+'</span><span class="name">'+escapeHtml(m.name||"")+'</span>'+(m.bolo?' <span class="pill destructive">BOLO</span>':'')+'</span><span class="when">'+fmtShort(m.at)+' · '+fmtAgo(m.at)+'</span></div><div>'+escapeHtml(m.text)+'</div></div>';
    }).join("") : '<div class="empty-state">No traffic on '+escapeHtml(ch.name)+' yet. Post the first message below.</div>')+
    '</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:8px;"><label class="chk-row" style="margin:0;"><input type="checkbox" id="boloChk"> Mark as BOLO</label></div>'+
    '<div style="display:flex;gap:8px;"><textarea id="chatInput" rows="2" placeholder="Message #'+escapeHtml(ch.name)+'…" style="flex:1;"></textarea><button class="btn primary" data-action="sendChat">Send</button></div>'+
    '<div class="small-muted" style="margin-top:6px;">Enter sends, Shift+Enter starts a new line. BOLOs are copied into the activity log automatically.</div>'+
  '</div></div>';
  return html;
}
function wireChat(){
  document.querySelectorAll("[data-chan]").forEach(function(b){ b.addEventListener("click", function(){ uiState.chatChannel=b.getAttribute("data-chan"); render(); }); });
  var addChan = document.querySelector('[data-action="addChan"]');
  if(addChan) addChan.addEventListener("click", function(){
    var name = document.getElementById("newChanName").value.trim();
    if(!name) return;
    var id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-");
    var ch = {id:id, name:name, desc:""};
    STATE.chat.channels.push(ch);
    uiState.chatChannel = id;
    persist(function(){ return DB.chat.addChannel(ch); }, "channel #"+name);
  });
  var send = document.querySelector('[data-action="sendChat"]');
  function doSend(){
    var txt = document.getElementById("chatInput").value.trim();
    if(!txt) return;
    var bolo = document.getElementById("boloChk").checked;
    var msg = {channel:uiState.chatChannel, from:session.callsign, name:session.name, bolo:bolo, text:txt, at:nowIso()};
    STATE.chat.messages.push(msg);
    if(bolo) logActivity("CHAT", session.callsign, "BOLO on "+(STATE.chat.channels.find(function(c){return c.id===uiState.chatChannel;})||{}).name+" — "+txt);
    persist(function(){ return DB.chat.addMessage(msg); }, "chat message");
  }
  if(send) send.addEventListener("click", doSend);
  var input = document.getElementById("chatInput");
  if(input) input.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); doSend(); } });
}

/* ---------------- RADIO PTT (stub) ---------------- */
function renderRadio(){
  return '<div class="card"><div class="section-head"><h2>Radio PTT</h2></div>'+
    '<div class="empty-state" style="padding:60px 20px;">'+
    '<div style="font-size:28px;margin-bottom:10px;">▶</div>'+
    '<div style="font-weight:600;color:hsl(var(--foreground));margin-bottom:6px;">Live push-to-talk isn\'t part of this migrated build yet</div>'+
    'The original Radio PTT was real-time app-to-app voice (WebRTC), which needs a signalling/media server — something a static console page can\'t provide on its own.<br>'+
    'Nothing was lost in the move: there was no recorded traffic and nobody was on air when this was migrated.<br><br>'+
    'Use <b>Patrol Chat</b> for now — BOLOs and urgent traffic there post to the activity log immediately.'+
    '</div></div>';
}

/* ---------------- TRUCK LOG ---------------- */
function renderTrucks(){
  var onSite = STATE.trucks.filter(function(t){return !t.timeOut;});
  var departed = STATE.trucks.filter(function(t){return t.timeOut;});
  var view = uiState.truckView||"onsite";
  var list = view==="onsite"?onSite:view==="departed"?departed:STATE.trucks;
  var html = '<div class="section-head"><h2>Truck Log — Gate Register</h2><span class="meta">'+onSite.length+' on site · '+STATE.trucks.filter(function(t){return t.timeIn && t.timeIn.slice(0,10)===new Date().toISOString().slice(0,10);}).length+' today</span></div>';
  html += '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">Gate Check-In</div><form id="truckForm">'+
    '<label class="field"><span class="lbl">Trucking Company <span class="req">*</span></span><input type="text" name="company" required></label>'+
    '<label class="field"><span class="lbl">Driver Name <span class="req">*</span></span><input type="text" name="driver" required></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Trailer # <span class="req">*</span></span><input type="text" name="trailer" required></label>'+
    '<label class="field"><span class="lbl">Tractor #</span><input type="text" name="tractor"></label></div>'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">No post specified</option>'+STATE.posts.map(function(p){return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>';}).join("")+'</select></label>'+
    '<label class="field"><span class="lbl">Purpose</span><select name="purpose"><option>Delivery</option><option>Pickup</option><option>Service</option><option>Other</option></select></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Dock / Door</span><input type="text" name="dock"></label><label class="field"><span class="lbl">Seal #</span><input type="text" name="seal"></label></div>'+
    '<label class="field"><span class="lbl">BOL / PO #</span><input type="text" name="bol"></label>'+
    '<label class="field"><span class="lbl">Driver License / CDL</span><input type="text" name="license"></label>'+
    '<label class="field"><span class="lbl">Notes</span><textarea name="notes" rows="2"></textarea></label>'+
    '<button type="submit" class="btn primary" style="width:100%;">Check in — time in now</button></form></div>';
  html += '<div class="card"><div class="tabs">'+["onsite","departed","all"].map(function(v){return '<button class="'+(view===v?"active":"")+'" data-truckview="'+v+'">'+(v==="onsite"?"On site ("+onSite.length+")":v==="departed"?"Departed":"All")+'</button>';}).join("")+'</div>';
  if(!list.length){ html += '<div class="empty-state">No trucks in this view.</div>'; }
  else {
    html += list.map(function(t){
      return '<div class="list-item"><div class="top"><span>'+escapeHtml(t.company)+' / '+escapeHtml(t.driver)+'</span><span>'+(t.timeOut?"OUT "+fmtShort(t.timeOut):"IN "+fmtShort(t.timeIn))+'</span></div>'+
        '<div class="meta">Trailer '+escapeHtml(t.trailer)+' · '+escapeHtml(t.post||"—")+' · '+escapeHtml(t.purpose||"")+'</div>'+
        (!t.timeOut? '<button class="btn sm" style="margin-top:6px;" data-truck-out="'+t.id+'">Check out</button>' : '<div class="small-muted">On site '+Math.round((new Date(t.timeOut)-new Date(t.timeIn))/60000)+'m</div>')+
      '</div>';
    }).join("");
  }
  html += '</div></div>';
  return html;
}
function wireTrucks(){
  document.querySelectorAll("[data-truckview]").forEach(function(b){ b.addEventListener("click", function(){ uiState.truckView=b.getAttribute("data-truckview"); render(); }); });
  var form = document.getElementById("truckForm");
  if(form) form.addEventListener("submit", function(e){
    e.preventDefault();
    var fd = new FormData(form);
    var postId = fd.get("post");
    var post = STATE.posts.find(function(p){return p.id===postId;});
    var t = {id:uid("trk"), company:fd.get("company"), driver:fd.get("driver"), trailer:fd.get("trailer"), tractor:fd.get("tractor")||"",
      post: postId?(postId+" "+(post?post.name:"")):"", purpose:fd.get("purpose"), dock:fd.get("dock")||"", seal:fd.get("seal")||"",
      bol:fd.get("bol")||"", license:fd.get("license")||"", notes:fd.get("notes")||"", timeIn:nowIso(), timeOut:null};
    STATE.trucks.unshift(t);
    logActivity("TRUCK", session.callsign, "Truck IN — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+(postId?" @ "+postId:""));
    form.reset(); persist(function(){ return DB.trucks.insert(t); }, "truck "+t.company);
  });
  document.querySelectorAll("[data-truck-out]").forEach(function(b){
    b.addEventListener("click", function(){
      var t = STATE.trucks.find(function(x){return x.id===b.getAttribute("data-truck-out");});
      t.timeOut = nowIso();
      var mins = Math.round((new Date(t.timeOut)-new Date(t.timeIn))/60000);
      logActivity("TRUCK", session.callsign, "Truck OUT — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+" — on site "+mins+"m");
      persist(function(){ return DB.trucks.checkOut(t.id, t.timeOut); }, "truck "+t.company+" checkout");
    });
  });
}

/* ---------------- PARKING LOT VIOLATIONS ---------------- */
function renderParking(){
  var C = window.__CAD;
  var list = STATE.parkingViolations.slice().sort(function(a,b){ return new Date(b.occurred)-new Date(a.occurred); });
  var openCount = STATE.parkingViolations.filter(function(v){return v.status!=="CLOSED";}).length;
  var today = new Date().toISOString().slice(0,10);
  var todayCount = STATE.parkingViolations.filter(function(v){return (v.occurred||"").slice(0,10)===today;}).length;
  var html = '<div class="section-head"><h2>Parking Lot Violations</h2><span class="meta">'+openCount+' open · '+todayCount+' today</span>'+
    '<button class="btn sm" data-action="parkingCsv">⭳ CSV</button></div>';
  html += '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">New Violation</div><form id="parkForm">'+
    '<label class="field"><span class="lbl">Violation Type <span class="req">*</span></span><select name="vtype" required><option value="">Select type…</option>'+
      C.VIOLATION_TYPES.map(function(v){return '<option value="'+v[0]+'">'+escapeHtml(v[1])+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Attach to Call</span><select name="call"><option value="">Standalone — not tied to a call</option>'+
      STATE.calls.filter(function(c){return c.status!=="CLEARED";}).map(function(c){return '<option value="'+c.id+'">#'+c.id+' — '+escapeHtml(c.nature||c.code)+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Attach to Report</span><select name="report"><option value="">Not linked to a report</option>'+
      STATE.reports.map(function(r){return '<option value="'+r.id+'">'+r.id+' — '+escapeHtml(r.subject)+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">No post specified</option>'+
      STATE.posts.map(function(p){return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Occurred <span class="req">*</span></span><input type="datetime-local" name="occurred" required value="'+nowLocalInput()+'"></label>'+
    '<label class="field"><span class="lbl">Location in Lot</span><input type="text" name="locationInLot" placeholder="Row C, spot 14, near Dock 4…"></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Vehicle Plate #</span><input type="text" name="plate"></label><label class="field"><span class="lbl">State</span><input type="text" name="plateState" maxlength="2" style="text-transform:uppercase;"></label></div>'+
    '<label class="field"><span class="lbl">Vehicle Description</span><input type="text" name="vehicleDesc" placeholder="Make / model / color"></label>'+
    '<label class="field"><span class="lbl">Driver / Subject (if known)</span><input type="text" name="driver"></label>'+
    '<label class="field"><span class="lbl">Narrative</span><textarea name="narrative" rows="3"></textarea></label>'+
    '<label class="field"><span class="lbl">Action Taken</span><select name="actionTaken">'+C.ACTION_TAKEN_OPTS.map(function(a){return '<option>'+a+'</option>';}).join("")+'</select></label>'+
    '<div class="small-muted" style="margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Notifications</div>'+
    '<label class="chk-row"><input type="checkbox" name="notifyPolice"> Police Notified</label>'+
    '<label class="chk-row"><input type="checkbox" name="notifyPropMgmt"> Property Management Notified</label>'+
    '<label class="chk-row"><input type="checkbox" name="notifyTow"> Tow Company Notified</label>'+
    '<label class="field"><span class="lbl">Who else was notified</span><input type="text" name="whoElse"></label>'+
    '<div style="display:flex;gap:8px;margin-top:10px;"><button type="submit" class="btn primary" style="flex:1;">Submit for review</button><button type="button" class="btn" data-action="parkDraft">Save draft</button></div>'+
    '</form></div>';

  html += '<div class="card"><div class="tabs">'+
    ["all","mine","awaiting","returned","approved","closed"].map(function(v){return '<button class="'+((uiState.parkFilter||"all")===v?"active":"")+'" data-parkfilter="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</button>';}).join("")+
    '</div>';
  var filt = uiState.parkFilter||"all";
  var shown = list.filter(function(v){
    if(filt==="mine") return v.writtenByCallsign===session.callsign;
    if(filt==="awaiting") return v.status==="SUBMITTED" || v.status==="OPEN";
    if(filt==="returned") return v.status==="RETURNED";
    if(filt==="approved") return v.status==="APPROVED";
    if(filt==="closed") return v.status==="CLOSED";
    return true;
  });
  html += '<div class="small-muted" style="margin-bottom:6px;">'+shown.length+' shown</div>';
  if(!shown.length){ html += '<div class="empty-state">No parking lot violations in this view.</div>'; }
  else {
    html += shown.map(function(v){
      var typeLabel = (C.VIOLATION_TYPES.find(function(t){return t[0]===v.vtype;})||["",v.vtype])[1];
      var st = v.status==="OPEN" ? "SUBMITTED" : v.status;
      return '<div class="list-item" data-open-park="'+v.id+'"><div class="top"><span>'+escapeHtml(v.id)+' · <span class="pill '+(st==="APPROVED"?"ok":st==="RETURNED"?"destructive":st==="CLOSED"?"muted":"warn")+'">'+st+'</span></span><span>'+fmtShort(v.occurred)+'</span></div>'+
        '<div class="subj">'+escapeHtml(typeLabel)+(v.plate?" — "+escapeHtml(v.plate)+" "+escapeHtml(v.plateState||""):"")+'</div>'+
        '<div class="meta">'+escapeHtml(v.writtenBy||"")+' · '+escapeHtml(v.locationInLot||v.post||"—")+'</div></div>';
    }).join("");
  }
  html += '</div></div>';

  if(uiState.openParkId){
    var pv = STATE.parkingViolations.find(function(v){return v.id===uiState.openParkId;});
    if(pv) html += renderParkModal(pv);
  }
  return html;
}
function nowLocalInput(){
  var d = new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}
function renderParkModal(v){
  var C = window.__CAD;
  var typeLabel = (C.VIOLATION_TYPES.find(function(t){return t[0]===v.vtype;})||["",v.vtype])[1];
  var st = v.status==="OPEN" ? "SUBMITTED" : v.status;
  var canReview = session.role==="SUPV" && (v.status==="SUBMITTED" || v.status==="OPEN");
  var canClose = v.status==="SUBMITTED" || v.status==="OPEN" || v.status==="APPROVED";
  var linkedReport = v.reportId ? STATE.reports.find(function(r){return r.id===v.reportId;}) : null;
  return '<div class="modal-backdrop" data-close-park="1"><div class="modal" onclick="event.stopPropagation()">'+
    '<button class="close" data-action="closeParkModal">✕</button>'+
    '<div class="rtaid">'+escapeHtml(v.id)+'</div> <span class="pill '+(st==="APPROVED"?"ok":st==="RETURNED"?"destructive":st==="CLOSED"?"muted":"warn")+'">'+st+'</span>'+
    '<h2>'+escapeHtml(typeLabel)+'</h2>'+
    '<div class="kv-grid">'+
      '<div><div class="k">Written by</div><div class="v">'+escapeHtml(v.writtenBy)+'</div></div>'+
      '<div><div class="k">Occurred</div><div class="v">'+fmtDT(v.occurred)+'</div></div>'+
      '<div><div class="k">Post</div><div class="v">'+escapeHtml(v.post||"—")+'</div></div>'+
      '<div><div class="k">Plate</div><div class="v">'+escapeHtml(v.plate||"—")+' '+escapeHtml(v.plateState||"")+'</div></div>'+
      '<div><div class="k">Vehicle</div><div class="v">'+escapeHtml(v.vehicleDesc||"—")+'</div></div>'+
      '<div><div class="k">Linked Report</div><div class="v">'+(linkedReport?escapeHtml(linkedReport.id+" — "+linkedReport.subject):"—")+'</div></div>'+
      (v.reviewedAt? '<div><div class="k">Reviewed</div><div class="v">'+fmtDT(v.reviewedAt)+' by '+escapeHtml(v.reviewedBy)+'</div></div>' : '')+
    '</div>'+
    '<div class="field-block"><div class="k">Narrative</div><div class="v">'+nl2br(v.narrative||"—")+'</div></div>'+
    '<div class="field-block"><div class="k">Action Taken</div><div class="v">'+escapeHtml(v.actionTaken||"—")+'</div></div>'+
    '<div class="field-block"><div class="k">Notifications</div><div class="v">'+
      ([v.notifications.police?"Police":null, v.notifications.propMgmt?"Property Mgmt":null, v.notifications.tow?"Tow Co.":null].filter(Boolean).join(", ")||"None")+
      (v.whoElseNotified?" · "+escapeHtml(v.whoElseNotified):"")+
    '</div></div>'+
    (v.supervisorNotes? '<div class="field-block"><div class="k">Supervisor Notes</div><div class="v">'+nl2br(v.supervisorNotes)+'</div></div>':'')+
    (canClose? '<div style="margin:14px 0;"><button class="btn sm ok" data-action="closeParkViolation" data-id="'+v.id+'">Mark closed</button></div>' : '')+
    (canReview? (
      '<div class="divider"></div><div style="font-weight:700;margin-bottom:8px;">Supervisor Review</div>'+
      '<textarea id="parkReviewNotes" rows="2" placeholder="Notes for the writer. Required when returning a violation."></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:8px;"><button class="btn ok" style="flex:1;" data-action="approveParking" data-id="'+v.id+'">✓ Approve</button><button class="btn" data-action="returnParking" data-id="'+v.id+'">↩ Return for corrections</button></div>'
    ) : '')+
  '</div></div>';
}
function wireParking(){
  var form = document.getElementById("parkForm");
  async function submitParking(status){
    var fd = new FormData(form);
    if(!fd.get("vtype") || !fd.get("occurred")){ toast("Violation type and occurred time are required."); return; }
    var seq = DB.configured ? await DB.counters.next("parking").catch(function(){ return (STATE.parkingSeq||0)+1; }) : (STATE.parkingSeq||0)+1;
    STATE.parkingSeq = seq;
    var id = "PLV-"+window.__CAD.todayCode()+"-"+String(seq).padStart(3,"0");
    var postId = fd.get("post"); var post = STATE.posts.find(function(p){return p.id===postId;});
    var v = {
      id:id, vtype:fd.get("vtype"), call:fd.get("call")||"", reportId: fd.get("report")||"", post: postId?(postId+" "+(post?post.name:"")):"",
      occurred: new Date(fd.get("occurred")).toISOString(), locationInLot: fd.get("locationInLot")||"",
      plate: fd.get("plate")||"", plateState:(fd.get("plateState")||"").toUpperCase(), vehicleDesc: fd.get("vehicleDesc")||"",
      driver: fd.get("driver")||"", narrative: fd.get("narrative")||"", actionTaken: fd.get("actionTaken")||"",
      notifications: {police: fd.get("notifyPolice")==="on", propMgmt: fd.get("notifyPropMgmt")==="on", tow: fd.get("notifyTow")==="on"},
      whoElseNotified: fd.get("whoElse")||"", status: status, writtenBy: session.name, writtenByCallsign: session.callsign, submittedAt: status==="DRAFT"?null:nowIso(),
      reviewedAt:null, reviewedBy:null, supervisorNotes:""
    };
    STATE.parkingViolations.unshift(v);
    var typeLabel = (window.__CAD.VIOLATION_TYPES.find(function(t){return t[0]===v.vtype;})||["",v.vtype])[1];
    logActivity("PARKING", session.callsign, (status==="DRAFT"?"Parking violation drafted ":"Parking violation submitted ")+id+" — "+typeLabel+(v.plate?" ("+v.plate+")":""));
    form.reset(); uiState.parkFilter="all";
    persist(function(){ return DB.parking.insert(v); }, "parking violation "+id);
  }
  if(form) form.addEventListener("submit", function(e){ e.preventDefault(); submitParking("SUBMITTED"); });
  var draftBtn = document.querySelector('[data-action="parkDraft"]');
  if(draftBtn) draftBtn.addEventListener("click", function(){ submitParking("DRAFT"); });
  document.querySelectorAll("[data-parkfilter]").forEach(function(b){ b.addEventListener("click", function(){ uiState.parkFilter=b.getAttribute("data-parkfilter"); render(); }); });
  document.querySelectorAll("[data-open-park]").forEach(function(el){ el.addEventListener("click", function(){ uiState.openParkId = el.getAttribute("data-open-park"); render(); }); });
  var bd = document.querySelector("[data-close-park]");
  if(bd) bd.addEventListener("click", function(){ uiState.openParkId=null; render(); });
  var cbtn = document.querySelector('[data-action="closeParkModal"]');
  if(cbtn) cbtn.addEventListener("click", function(){ uiState.openParkId=null; render(); });
  var closeViol = document.querySelector('[data-action="closeParkViolation"]');
  if(closeViol) closeViol.addEventListener("click", function(){
    var v = STATE.parkingViolations.find(function(x){return x.id===closeViol.getAttribute("data-id");});
    v.status="CLOSED"; logActivity("PARKING", session.callsign, "Parking violation "+v.id+" marked closed");
    uiState.openParkId=null;
    persist(function(){ return DB.parking.update(v.id, {status:"CLOSED"}); }, "violation "+v.id+" close");
  });
  var apprBtn = document.querySelector('[data-action="approveParking"]');
  if(apprBtn) apprBtn.addEventListener("click", function(){
    var v = STATE.parkingViolations.find(function(x){return x.id===apprBtn.getAttribute("data-id");});
    var notesEl = document.getElementById("parkReviewNotes"); var notes = notesEl?notesEl.value.trim():"";
    v.status="APPROVED"; v.reviewedAt=nowIso(); v.reviewedBy=session.callsign; if(notes) v.supervisorNotes=notes;
    logActivity("PARKING", session.callsign, "Parking violation "+v.id+" approved by "+session.callsign+(notes?" — "+notes:""));
    persist(function(){ return DB.parking.update(v.id, {status:"APPROVED", reviewed_at:v.reviewedAt, reviewed_by:v.reviewedBy, supervisor_notes:v.supervisorNotes}); }, "violation "+v.id+" approval");
  });
  var retParkBtn = document.querySelector('[data-action="returnParking"]');
  if(retParkBtn) retParkBtn.addEventListener("click", function(){
    var v = STATE.parkingViolations.find(function(x){return x.id===retParkBtn.getAttribute("data-id");});
    var notesEl = document.getElementById("parkReviewNotes"); var notes = notesEl?notesEl.value.trim():"";
    if(!notes){ toast("Notes are required when returning a violation."); return; }
    v.status="RETURNED"; v.reviewedAt=nowIso(); v.reviewedBy=session.callsign; v.supervisorNotes=notes;
    logActivity("PARKING", session.callsign, "Parking violation "+v.id+" returned by "+session.callsign+" — "+notes);
    persist(function(){ return DB.parking.update(v.id, {status:"RETURNED", reviewed_at:v.reviewedAt, reviewed_by:v.reviewedBy, supervisor_notes:v.supervisorNotes}); }, "violation "+v.id+" return");
  });
  var csvBtn = document.querySelector('[data-action="parkingCsv"]');
  if(csvBtn) csvBtn.addEventListener("click", function(){ downloadCsv("parking_violations.csv", parkingToCsv()); });
}
function parkingToCsv(){
  var rows = [["ID","Type","Status","Occurred","Post","Linked Report","Plate","State","Vehicle","Driver","Action Taken","Written By","Narrative"]];
  STATE.parkingViolations.forEach(function(v){
    var typeLabel = (window.__CAD.VIOLATION_TYPES.find(function(t){return t[0]===v.vtype;})||["",v.vtype])[1];
    rows.push([v.id, typeLabel, v.status, v.occurred, v.post, v.reportId||"", v.plate, v.plateState, v.vehicleDesc, v.driver, v.actionTaken, v.writtenBy, v.narrative]);
  });
  return rows;
}
function downloadCsv(filename, rows){
  var csv = rows.map(function(r){ return r.map(function(c){ c=(c==null?"":String(c)); if(/[",\n]/.test(c)) c='"'+c.replace(/"/g,'""')+'"'; return c; }).join(","); }).join("\r\n");
  var blob = new Blob([csv], {type:"text/csv"});
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);}, 2000);
}

/* ---------------- FIELD REPORTS ---------------- */
function renderReports(){
  var C = window.__CAD;
  var tab = uiState.reportsTab || "incident";
  var html = '<div class="section-head"><h2>Field Reports</h2><span class="meta">'+STATE.reports.length+' reports</span>'+
    '<button class="btn sm" data-action="reportsCsv">⭳ Reports CSV</button></div>';
  html += '<div class="tabs">'+
    '<button class="'+(tab==="incident"?"active":"")+'" data-reptab="incident">Incident Reports '+STATE.reports.length+'</button>'+
    '<button class="'+(tab==="police"?"active":"")+'" data-reptab="police">Police On Property '+STATE.policeOnProperty.filter(function(p){return !p.departedAt;}).length+' now</button>'+
    '<button class="'+(tab==="self"?"active":"")+'" data-reptab="self">Self-Initiated Call</button>'+
  '</div>';
  if(tab==="police"){ html += renderPoliceOnProperty(); return html; }
  if(tab==="self"){
    html += '<div class="empty-state">Nothing logged in this tab yet.</div>';
    return html;
  }
  html += '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">New Incident Report</div><form id="reportForm">'+
    '<label class="field"><span class="lbl">Report Type <span class="req">*</span></span><select name="rtype" required>'+
      C.REPORT_TYPES.map(function(r){return '<option value="'+r[0]+'">'+escapeHtml(r[1])+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Attach to Call</span><select name="call"><option value="">Standalone — not tied to a call</option>'+
      STATE.calls.filter(function(c){return c.status!=="CLEARED";}).map(function(c){return '<option value="'+c.id+'">#'+c.id+'</option>';}).join("")+
    '</select></label>'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">No post specified</option>'+STATE.posts.map(function(p){return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>';}).join("")+'</select></label>'+
    '<label class="field"><span class="lbl">Occurred <span class="req">*</span></span><input type="datetime-local" name="occurred" required value="'+nowLocalInput()+'"></label>'+
    '<label class="field"><span class="lbl">Location on Property</span><input type="text" name="location" placeholder="Dock 4, west fence line, lobby…"></label>'+
    '<label class="field"><span class="lbl">Subject — one line <span class="req">*</span></span><input type="text" name="subject" required placeholder="Trespass warning issued at north gate"></label>'+
    '<label class="field"><span class="lbl">Narrative</span><textarea name="narrative" rows="3"></textarea></label>'+
    '<label class="field"><span class="lbl">Involved Parties</span><textarea name="involvedParties" rows="2"></textarea></label>'+
    '<label class="field"><span class="lbl">Witnesses</span><textarea name="witnesses" rows="2"></textarea></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Property Damage / Loss</span><input type="text" name="propertyDamage"></label><label class="field"><span class="lbl">Est. Loss</span><input type="text" name="estLoss"></label></div>'+
    '<label class="field"><span class="lbl">Action Taken</span><textarea name="actionTaken" rows="2"></textarea></label>'+
    '<div class="small-muted" style="margin-bottom:4px;text-transform:uppercase;">Notifications</div>'+
    '<label class="chk-row"><input type="checkbox" name="injury"> Injury reported</label>'+
    '<label class="chk-row"><input type="checkbox" name="ems"> EMS notified</label>'+
    '<label class="chk-row"><input type="checkbox" name="police"> Police notified</label>'+
    '<label class="field"><span class="lbl">Who else was notified</span><input type="text" name="whoElse"></label>'+
    '<label class="chk-row"><input type="checkbox" name="force"> Force was used — physical contact, restraint or detention</label>'+
    '<div style="display:flex;gap:8px;margin-top:10px;"><button type="submit" class="btn primary" style="flex:1;">Submit for review</button><button type="button" class="btn" data-action="reportDraft">Save draft</button></div>'+
    '<div class="small-muted" style="margin-top:8px;">Your callsign and name are stamped on the report by the server. A submitted report locks until a supervisor approves it or returns it for corrections.</div>'+
  '</form></div>';

  html += '<div class="card"><div class="tabs">'+
    ["all","mine","awaiting","returned","approved"].map(function(f){return '<button class="'+((uiState.reportsFilter||"all")===f?"active":"")+'" data-repfilter="'+f+'">'+f[0].toUpperCase()+f.slice(1)+'</button>';}).join("")+
    '</div>';
  var filt = uiState.reportsFilter||"all";
  var list = STATE.reports.filter(function(r){
    if(filt==="mine") return r.writtenByCallsign===session.callsign;
    if(filt==="awaiting") return r.status==="SUBMITTED";
    if(filt==="returned") return r.status==="RETURNED";
    if(filt==="approved") return r.status==="APPROVED";
    return true;
  });
  html += '<div class="small-muted" style="margin-bottom:6px;">'+list.length+' shown</div>';
  if(!list.length) html += '<div class="empty-state">No reports in this view.</div>';
  else html += list.map(function(r){
    return '<div class="list-item" data-open-report="'+r.id+'"><div class="top"><span class="mono" style="color:hsl(var(--prio-3));">'+r.id+'</span> <span class="pill '+(r.status==="APPROVED"?"ok":r.status==="RETURNED"?"destructive":"warn")+'">'+r.status+'</span> <span class="pill muted">'+escapeHtml(r.typeLabel)+'</span><span style="float:right;">'+fmtShort(r.submittedAt||r.occurred)+'</span></div>'+
      '<div class="subj">'+escapeHtml(r.subject)+'</div><div class="meta">'+escapeHtml(r.writtenBy)+' · '+escapeHtml(r.writtenByCallsign)+(r.post?' · '+escapeHtml(r.post):'')+(r.location?' · '+escapeHtml(r.location):'')+'</div></div>';
  }).join("");
  html += '</div></div>';

  if(uiState.openReportId){
    var rep = STATE.reports.find(function(r){return r.id===uiState.openReportId;});
    if(rep) html += renderReportModal(rep);
  }
  return html;
}
function renderReportModal(r){
  var canReview = session.role==="SUPV" && r.status==="SUBMITTED";
  return '<div class="modal-backdrop" data-close-report="1"><div class="modal" onclick="event.stopPropagation()">'+
    '<button class="close" data-action="closeReportModal">✕</button>'+
    '<div class="rtaid">'+r.id+'</div> <span class="pill '+(r.status==="APPROVED"?"ok":r.status==="RETURNED"?"destructive":"warn")+'">'+r.status+'</span> <span class="pill muted">'+escapeHtml(r.typeLabel)+'</span>'+
    '<h2>'+escapeHtml(r.subject)+'</h2>'+
    '<div class="kv-grid">'+
      '<div><div class="k">Written by</div><div class="v">'+escapeHtml(r.writtenBy)+' ('+escapeHtml(r.writtenByCallsign)+')</div></div>'+
      '<div><div class="k">Occurred</div><div class="v">'+fmtDT(r.occurred)+'</div></div>'+
      '<div><div class="k">Post</div><div class="v">'+escapeHtml(r.post||"—")+'</div></div>'+
      '<div><div class="k">Location</div><div class="v">'+escapeHtml(r.location||"—")+'</div></div>'+
      '<div><div class="k">Linked Call</div><div class="v">'+escapeHtml(r.attachToCall||"Standalone")+'</div></div>'+
      '<div><div class="k">Submitted</div><div class="v">'+fmtDT(r.submittedAt)+'</div></div>'+
      (r.reviewedAt? '<div><div class="k">Reviewed</div><div class="v">'+fmtDT(r.reviewedAt)+' by '+escapeHtml(r.reviewedBy)+'</div></div>' : '')+
    '</div>'+
    '<div class="field-block"><div class="k">Narrative</div><div class="v">'+nl2br(r.narrative)+'</div></div>'+
    (r.involvedParties? '<div class="field-block"><div class="k">Involved Parties</div><div class="v">'+nl2br(r.involvedParties)+'</div></div>':'')+
    (r.witnesses? '<div class="field-block"><div class="k">Witnesses</div><div class="v">'+nl2br(r.witnesses)+'</div></div>':'')+
    (r.actionTaken? '<div class="field-block"><div class="k">Action Taken</div><div class="v">'+nl2br(r.actionTaken)+'</div></div>':'')+
    (r.supervisorNotes? '<div class="field-block"><div class="k">Supervisor Notes</div><div class="v">'+nl2br(r.supervisorNotes)+'</div></div>':'')+
    '<div style="display:flex;gap:8px;margin:14px 0;"><button class="btn sm" data-action="copyReport" data-id="'+r.id+'">Copy text</button></div>'+
    (canReview? (
      '<div class="divider"></div><div style="font-weight:700;margin-bottom:8px;">Supervisor Review</div>'+
      '<textarea id="reviewNotes" rows="2" placeholder="Notes for the writer. Required when returning a report."></textarea>'+
      '<div style="display:flex;gap:8px;margin-top:8px;"><button class="btn ok" style="flex:1;" data-action="approveReport" data-id="'+r.id+'">✓ Approve</button><button class="btn" data-action="returnReport" data-id="'+r.id+'">↩ Return for corrections</button></div>'
    ) : '')+
  '</div></div>';
}
function wireReports(){
  document.querySelectorAll("[data-reptab]").forEach(function(b){ b.addEventListener("click", function(){ uiState.reportsTab=b.getAttribute("data-reptab"); render(); }); });
  document.querySelectorAll("[data-repfilter]").forEach(function(b){ b.addEventListener("click", function(){ uiState.reportsFilter=b.getAttribute("data-repfilter"); render(); }); });
  var form = document.getElementById("reportForm");
  async function submitReport(status){
    var fd = new FormData(form);
    if(!fd.get("subject") || !fd.get("occurred")){ toast("Subject and occurred time are required."); return; }
    var C = window.__CAD;
    var seq = DB.configured ? await DB.counters.next("report").catch(function(){ return (STATE.reportSeq||0)+1; }) : (STATE.reportSeq||0)+1;
    STATE.reportSeq = seq;
    var id = "RTA-"+C.todayCode()+"-"+String(seq).padStart(3,"0");
    var typeInfo = C.REPORT_TYPES.find(function(t){return t[0]===fd.get("rtype");}) || ["general","General Incident"];
    var postId = fd.get("post"); var post = STATE.posts.find(function(p){return p.id===postId;});
    var r = {
      id:id, type:typeInfo[0], typeLabel:typeInfo[1], status: status==="DRAFT"?"DRAFT":"SUBMITTED",
      attachToCall: fd.get("call")||"Standalone", post: postId?(postId+" "+(post?post.name:"")):"",
      occurred: new Date(fd.get("occurred")).toISOString(), location: fd.get("location")||"", subject: fd.get("subject"),
      narrative: fd.get("narrative")||"", involvedParties: fd.get("involvedParties")||"", witnesses: fd.get("witnesses")||"",
      propertyDamage: fd.get("propertyDamage")||"", estLoss: fd.get("estLoss")||"", actionTaken: fd.get("actionTaken")||"",
      notifications: {injury: fd.get("injury")==="on", ems: fd.get("ems")==="on", police: fd.get("police")==="on"},
      whoElseNotified: fd.get("whoElse")||"", forceUsed: fd.get("force")==="on",
      writtenBy: session.name, writtenByCallsign: session.callsign, submittedAt: status==="DRAFT"?null:nowIso(),
      reviewedAt:null, reviewedBy:null, supervisorNotes:""
    };
    STATE.reports.unshift(r);
    if(status!=="DRAFT") logActivity("REPORT", session.callsign, "REPORT SUBMITTED "+id+" — "+typeInfo[0]+": "+r.subject);
    form.reset();
    persist(function(){ return DB.reports.insert(r); }, "report "+id);
  }
  if(form) form.addEventListener("submit", function(e){ e.preventDefault(); submitReport("SUBMITTED"); });
  var draftBtn = document.querySelector('[data-action="reportDraft"]');
  if(draftBtn) draftBtn.addEventListener("click", function(){ submitReport("DRAFT"); });
  document.querySelectorAll("[data-open-report]").forEach(function(el){ el.addEventListener("click", function(){ uiState.openReportId = el.getAttribute("data-open-report"); render(); }); });
  var bd = document.querySelector("[data-close-report]");
  if(bd) bd.addEventListener("click", function(){ uiState.openReportId=null; render(); });
  var cbtn = document.querySelector('[data-action="closeReportModal"]');
  if(cbtn) cbtn.addEventListener("click", function(){ uiState.openReportId=null; render(); });
  var apprBtn = document.querySelector('[data-action="approveReport"]');
  if(apprBtn) apprBtn.addEventListener("click", function(){
    var r = STATE.reports.find(function(x){return x.id===apprBtn.getAttribute("data-id");});
    var notes = document.getElementById("reviewNotes").value.trim();
    r.status="APPROVED"; r.reviewedAt=nowIso(); r.reviewedBy=session.callsign; if(notes) r.supervisorNotes=notes;
    logActivity("REPORT", session.callsign, "REPORT APPROVED "+r.id+" by "+session.callsign+(notes?" — "+notes:""));
    persist(function(){ return DB.reports.update(r.id, {status:"APPROVED", reviewed_at:r.reviewedAt, reviewed_by:r.reviewedBy, supervisor_notes:r.supervisorNotes}); }, "report "+r.id+" approval");
  });
  var retBtn = document.querySelector('[data-action="returnReport"]');
  if(retBtn) retBtn.addEventListener("click", function(){
    var r = STATE.reports.find(function(x){return x.id===retBtn.getAttribute("data-id");});
    var notes = document.getElementById("reviewNotes").value.trim();
    if(!notes){ toast("Notes are required when returning a report."); return; }
    r.status="RETURNED"; r.reviewedAt=nowIso(); r.reviewedBy=session.callsign; r.supervisorNotes=notes;
    logActivity("REPORT", session.callsign, "REPORT RETURNED "+r.id+" by "+session.callsign+" — "+notes);
    persist(function(){ return DB.reports.update(r.id, {status:"RETURNED", reviewed_at:r.reviewedAt, reviewed_by:r.reviewedBy, supervisor_notes:r.supervisorNotes}); }, "report "+r.id+" return");
  });
  var copyBtn = document.querySelector('[data-action="copyReport"]');
  if(copyBtn) copyBtn.addEventListener("click", function(){
    var r = STATE.reports.find(function(x){return x.id===copyBtn.getAttribute("data-id");});
    var txt = r.id+" — "+r.subject+"\n"+r.narrative;
    if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){toast("Copied.");});
  });
  var csvBtn = document.querySelector('[data-action="reportsCsv"]');
  if(csvBtn) csvBtn.addEventListener("click", function(){
    var rows=[["ID","Type","Status","Occurred","Subject","WrittenBy","Post","Narrative"]];
    STATE.reports.forEach(function(r){ rows.push([r.id,r.typeLabel,r.status,r.occurred,r.subject,r.writtenBy,r.post,r.narrative]); });
    downloadCsv("field_reports.csv", rows);
  });
  wirePoliceOnProperty();
}

/* ---------------- POLICE ON PROPERTY (tab within Field Reports) ---------------- */
function renderPoliceOnProperty(){
  var onSite = STATE.policeOnProperty.filter(function(p){return !p.departedAt;});
  var past = STATE.policeOnProperty.filter(function(p){return p.departedAt;});
  var view = uiState.policeView||"onsite";
  var list = view==="onsite"?onSite:view==="past"?past:STATE.policeOnProperty;
  var html = '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">Log Police Arrival</div><form id="policeForm">'+
    '<label class="field"><span class="lbl">Agency <span class="req">*</span></span><input type="text" name="agency" required placeholder="Ridgecrest PD, county sheriff…"></label>'+
    '<label class="field"><span class="lbl">Officer / Badge #</span><input type="text" name="officer" placeholder="Name or badge number"></label>'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">No post specified</option>'+STATE.posts.map(function(p){return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>';}).join("")+'</select></label>'+
    '<label class="field"><span class="lbl">Reason On Property <span class="req">*</span></span><input type="text" name="reason" required placeholder="Welfare check, traffic stop, call for service…"></label>'+
    '<label class="field"><span class="lbl">Notes</span><textarea name="notes" rows="2"></textarea></label>'+
    '<button type="submit" class="btn primary" style="width:100%;">Log arrival — time in now</button></form></div>';
  html += '<div class="card"><div class="tabs">'+["onsite","past","all"].map(function(v){return '<button class="'+(view===v?"active":"")+'" data-policeview="'+v+'">'+(v==="onsite"?"On property ("+onSite.length+")":v==="past"?"Departed":"All")+'</button>';}).join("")+'</div>';
  if(!list.length){ html += '<div class="empty-state">No police-on-property entries in this view.</div>'; }
  else {
    html += list.map(function(p){
      return '<div class="list-item"><div class="top"><span>'+escapeHtml(p.agency)+(p.officer?' — '+escapeHtml(p.officer):'')+'</span>'+
        '<span class="pill '+(p.departedAt?"muted":"warn")+'">'+(p.departedAt?"DEPARTED "+fmtShort(p.departedAt):"ON PROPERTY")+'</span></div>'+
        '<div class="subj">'+escapeHtml(p.reason)+'</div>'+
        '<div class="meta">Arrived '+fmtShort(p.arrivedAt)+(p.post?' · '+escapeHtml(p.post):'')+(p.notes?' · '+escapeHtml(p.notes):'')+'</div>'+
        (!p.departedAt? '<button class="btn sm" style="margin-top:6px;" data-police-depart="'+p.id+'">Log departure</button>' : '<div class="small-muted">On property '+Math.round((new Date(p.departedAt)-new Date(p.arrivedAt))/60000)+'m</div>')+
      '</div>';
    }).join("");
  }
  html += '</div></div>';
  return html;
}
function wirePoliceOnProperty(){
  document.querySelectorAll("[data-policeview]").forEach(function(b){ b.addEventListener("click", function(){ uiState.policeView=b.getAttribute("data-policeview"); render(); }); });
  var form = document.getElementById("policeForm");
  if(form) form.addEventListener("submit", function(e){
    e.preventDefault();
    var fd = new FormData(form);
    if(!fd.get("agency") || !fd.get("reason")){ toast("Agency and reason on property are required."); return; }
    var postId = fd.get("post"); var post = STATE.posts.find(function(x){return x.id===postId;});
    var p = {id:uid("police"), agency:fd.get("agency"), officer:fd.get("officer")||"",
      post: postId?(postId+" "+(post?post.name:"")):"", reason:fd.get("reason"), notes:fd.get("notes")||"",
      arrivedAt:nowIso(), departedAt:null};
    STATE.policeOnProperty.unshift(p);
    logActivity("POLICE", session.callsign, "Police on property — "+p.agency+(p.officer?" ("+p.officer+")":"")+" — "+p.reason);
    form.reset();
    persist(function(){ return DB.police.insert(p); }, "police on property — "+p.agency);
  });
  document.querySelectorAll("[data-police-depart]").forEach(function(b){
    b.addEventListener("click", function(){
      var p = STATE.policeOnProperty.find(function(x){return x.id===b.getAttribute("data-police-depart");});
      if(!p) return;
      p.departedAt = nowIso();
      logActivity("POLICE", session.callsign, "Police departed — "+p.agency+(p.officer?" ("+p.officer+")":""));
      persist(function(){ return DB.police.depart(p.id, p.departedAt); }, "police departure — "+p.agency);
    });
  });
}

/* ---------------- GUARD NOTES (shared shift pass-down board) ---------------- */
function renderGuardNotes(){
  var open = STATE.guardNotes.filter(function(n){return !n.resolved;});
  var view = uiState.guardNotesFilter||"open";
  var list = view==="open"?open:view==="resolved"?STATE.guardNotes.filter(function(n){return n.resolved;}):STATE.guardNotes;
  // Pinned notes float to the top within whatever list is showing, newest first within each group.
  list = list.slice().sort(function(a,b){ if(!!b.pinned - !!a.pinned !== 0) return (b.pinned?1:0)-(a.pinned?1:0); return new Date(b.createdAt)-new Date(a.createdAt); });
  var html = '<div class="section-head"><h2>Guard Notes</h2><span class="meta">'+open.length+' open</span></div>';
  html += '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">New Note</div><form id="guardNoteForm">'+
    '<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">General — not site-specific</option>'+STATE.posts.map(function(p){return '<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.id+" — "+p.name)+'</option>';}).join("")+'</select></label>'+
    '<label class="field"><span class="lbl">Note <span class="req">*</span></span><textarea name="text" rows="4" required placeholder="Gate code changed, BOLO on a vehicle, equipment down, handoff info for next shift…"></textarea></label>'+
    (session.role==="SUPV"? '<label class="chk-row"><input type="checkbox" name="pinned"> Pin to top — important</label>' : '')+
    '<button type="submit" class="btn primary" style="width:100%;">Post note</button></form></div>';
  html += '<div class="card"><div class="tabs">'+["open","resolved","all"].map(function(v){return '<button class="'+(view===v?"active":"")+'" data-gnfilter="'+v+'">'+v[0].toUpperCase()+v.slice(1)+'</button>';}).join("")+'</div>';
  if(!list.length){ html += '<div class="empty-state">No notes in this view.</div>'; }
  else {
    html += list.map(function(n){
      return '<div class="list-item">'+
        '<div class="top">'+(n.pinned? '<span class="pill warn">PINNED</span> ' : '')+'<span>'+escapeHtml(n.post||"General")+'</span>'+
        '<span class="pill '+(n.resolved?"muted":"ok")+'">'+(n.resolved?"RESOLVED":"OPEN")+'</span></div>'+
        '<div class="subj">'+nl2br(n.text)+'</div>'+
        '<div class="meta">'+escapeHtml(n.authorName)+' · '+escapeHtml(n.authorCallsign)+' · '+fmtShort(n.createdAt)+
          (n.resolved? ' · resolved by '+escapeHtml(n.resolvedBy||"")+' '+fmtShort(n.resolvedAt) : '')+'</div>'+
        '<div style="display:flex;gap:8px;margin-top:6px;">'+
          (!n.resolved? '<button class="btn sm" data-gn-resolve="'+n.id+'">Mark resolved</button>' : '<button class="btn sm" data-gn-reopen="'+n.id+'">Reopen</button>')+
          (session.role==="SUPV"? '<button class="btn sm" data-gn-pin="'+n.id+'">'+(n.pinned?"Unpin":"Pin")+'</button>' : '')+
        '</div>'+
      '</div>';
    }).join("");
  }
  html += '</div></div>';
  return html;
}
function wireGuardNotes(){
  document.querySelectorAll("[data-gnfilter]").forEach(function(b){ b.addEventListener("click", function(){ uiState.guardNotesFilter=b.getAttribute("data-gnfilter"); render(); }); });
  var form = document.getElementById("guardNoteForm");
  if(form) form.addEventListener("submit", function(e){
    e.preventDefault();
    var fd = new FormData(form);
    var text = (fd.get("text")||"").trim();
    if(!text){ toast("Note text is required."); return; }
    var postId = fd.get("post"); var post = STATE.posts.find(function(x){return x.id===postId;});
    var n = {id:uid("note"), post: postId?(postId+" "+(post?post.name:"")):"", text:text,
      pinned: session.role==="SUPV" && fd.get("pinned")==="on",
      authorName: session.name, authorCallsign: session.callsign, createdAt:nowIso(),
      resolved:false, resolvedAt:null, resolvedBy:null};
    STATE.guardNotes.unshift(n);
    logActivity("NOTE", session.callsign, "Guard note posted"+(n.post?" — "+n.post:"")+": "+text.slice(0,80));
    form.reset();
    persist(function(){ return DB.guardNotes.insert(n); }, "guard note");
  });
  document.querySelectorAll("[data-gn-resolve]").forEach(function(b){
    b.addEventListener("click", function(){
      var n = STATE.guardNotes.find(function(x){return x.id===b.getAttribute("data-gn-resolve");});
      if(!n) return;
      n.resolved=true; n.resolvedAt=nowIso(); n.resolvedBy=session.callsign;
      logActivity("NOTE", session.callsign, "Guard note resolved — "+n.text.slice(0,80));
      persist(function(){ return DB.guardNotes.setResolved(n.id, true, n.resolvedAt, n.resolvedBy); }, "guard note resolve");
    });
  });
  document.querySelectorAll("[data-gn-reopen]").forEach(function(b){
    b.addEventListener("click", function(){
      var n = STATE.guardNotes.find(function(x){return x.id===b.getAttribute("data-gn-reopen");});
      if(!n) return;
      n.resolved=false; n.resolvedAt=null; n.resolvedBy=null;
      logActivity("NOTE", session.callsign, "Guard note reopened — "+n.text.slice(0,80));
      persist(function(){ return DB.guardNotes.setResolved(n.id, false, null, null); }, "guard note reopen");
    });
  });
  document.querySelectorAll("[data-gn-pin]").forEach(function(b){
    b.addEventListener("click", function(){
      if(session.role!=="SUPV") return;
      var n = STATE.guardNotes.find(function(x){return x.id===b.getAttribute("data-gn-pin");});
      if(!n) return;
      n.pinned = !n.pinned;
      persist(function(){ return DB.guardNotes.setPinned(n.id, n.pinned); }, "guard note pin");
    });
  });
}

/* ---------------- ACTIVITY LOG ---------------- */
function renderLog(){
  var C = window.__CAD;
  var list = STATE.activityLog;
  var html = '<div class="section-head"><h2>Activity Log</h2><span class="meta">'+list.length+' entries</span>'+
    '<div style="display:flex;gap:6px;"><button class="btn sm" data-action="logCsv">Log CSV</button></div></div>';
  html += '<div class="card" style="max-height:70vh;overflow-y:auto;"><table class="datatable"><thead><tr><th>Time</th><th>Type</th><th>Actor</th><th>Detail</th></tr></thead><tbody>'+
    list.map(function(l){
      return '<tr><td class="mono small-muted" style="white-space:nowrap;">'+fmtShort(l.at)+'</td><td><span class="pill muted">'+l.type+'</span></td><td class="mono">'+escapeHtml(l.actor)+'</td><td>'+escapeHtml(l.text)+'</td></tr>';
    }).join("") + '</tbody></table></div>';

  // shift report
  var calls = STATE.calls.length, cleared = STATE.calls.filter(function(c){return c.status==="CLEARED";}).length;
  var open = STATE.calls.filter(function(c){return c.status!=="CLEARED";}).length;
  html += '<div class="card" style="margin-top:16px;"><div class="section-head"><h2>Shift Report <span class="meta">Last 12 hours</span></h2></div>'+
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:14px;text-align:center;">'+
    [["Calls",calls],["Cleared",cleared],["Open now",open],["Chat traffic",STATE.chat.messages.length],["BOLOs",STATE.chat.messages.filter(function(m){return m.bolo;}).length]].map(function(s){
      return '<div><div style="font-size:20px;font-weight:700;">'+s[1]+'</div><div class="small-muted">'+s[0]+'</div></div>';
    }).join("")+
    '</div><div style="display:flex;gap:8px;margin-top:16px;"><button class="btn sm" data-action="copyShift">Copy shift report</button><button class="btn sm" data-action="printShift">Print</button></div></div>';
  return html;
}
function wireLog(){
  var csvBtn = document.querySelector('[data-action="logCsv"]');
  if(csvBtn) csvBtn.addEventListener("click", function(){
    var rows=[["Time","Type","Actor","Detail"]];
    STATE.activityLog.forEach(function(l){ rows.push([l.at,l.type,l.actor,l.text]); });
    downloadCsv("activity_log.csv", rows);
  });
  var printBtn = document.querySelector('[data-action="printShift"]');
  if(printBtn) printBtn.addEventListener("click", function(){ window.print(); });
  var copyBtn = document.querySelector('[data-action="copyShift"]');
  if(copyBtn) copyBtn.addEventListener("click", function(){
    var txt = "Shift report — "+fmtDT(nowIso());
    if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){toast("Copied.");});
  });
}

/* ---------------- USERS ---------------- */
function renderUsers(){
  var active = STATE.users.filter(function(u){return u.active;}).length;
  var html = '<div class="card"><div class="section-head"><h2>User Accounts</h2><span class="meta">'+active+' active / '+STATE.users.length+' total</span>'+
    (session.role==="SUPV"? '<button class="btn sm primary" data-action="addUser">+ Add account</button>' : '')+
    '</div>'+
    '<div class="small-muted" style="margin-bottom:14px;">Every account signs in with a callsign and a PIN. Guards can read the board and report — post to Patrol Chat, scan checkpoints, log trucks and attach photos. Supervisors add the roster, post directory, these accounts and the data reset. A supervisor account\'s <b>Map access</b> controls what it sees on the Live Map: a specific site limits it to that site\'s guards (Supervisor); All Sites shows everyone (Dispatch/Admin).</div>';
  html += STATE.users.map(function(u){
    var mapAccess = "";
    if(u.role==="SUPV"){
      var current = u.assignedPostId||"";
      var currentPost = current ? STATE.posts.find(function(p){return p.id===current;}) : null;
      var currentLabel = current ? (currentPost ? currentPost.id+" — "+currentPost.name : current) : "All Sites (Dispatch/Admin)";
      mapAccess = session.role==="SUPV" ?
        ('<div style="margin-top:6px;"><span class="small-muted" style="margin-right:6px;">Map access</span>'+
          '<select class="mapAccessSel" data-user="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:12px;padding:4px 6px;">'+
            '<option value="">All Sites (Dispatch/Admin)</option>'+
            STATE.posts.map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(current===p.id?"selected":"")+'>'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
          '</select></div>')
        : ('<div class="small-muted" style="margin-top:4px;">Map access: '+escapeHtml(currentLabel)+'</div>');
    }
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid hsl(var(--border)/.6);">'+
      '<div><div style="font-weight:700;">'+escapeHtml(u.callsign)+' <span class="pill blue">'+u.role+'</span>'+(u.callsign===session.callsign?' <span class="pill ok">YOU</span>':'')+'</div>'+
      '<div class="small-muted">'+escapeHtml(u.name)+' — '+escapeHtml(u.title)+'</div>'+
      '<div class="small-muted">Last sign-in: '+(u.lastSignIn?fmtShort(u.lastSignIn):"never")+'</div>'+
      mapAccess+
      '</div>'+
      (session.role==="SUPV"? '<div style="display:flex;gap:6px;"><button class="btn sm" data-reset-pin="'+escapeHtml(u.callsign)+'">Reset PIN</button><button class="btn sm ghost" data-toggle-active="'+escapeHtml(u.callsign)+'">'+(u.active?"Deactivate":"Activate")+'</button></div>' : '')+
    '</div>';
  }).join("");
  html += '</div>';
  return html;
}
function wireUsers(){
  var addBtn = document.querySelector('[data-action="addUser"]');
  if(addBtn) addBtn.addEventListener("click", async function(){
    var cs = prompt("New callsign (e.g. ST5-61)"); if(!cs) return;
    var name = prompt("Guard name")||""; if(!name) return;
    if(STATE.users.some(function(u){return u.callsign===cs;})){ toast("Callsign "+cs+" already exists."); return; }
    var u = {callsign:cs, name:name, role:"GUARD", title:"Security Guard", active:true, lastSignIn:null, mustChangePin:true};
    if(DB.configured){
      try{ await DB.auth.createGuard(cs, name, "1234"); }
      catch(e){ toast("Couldn't create the account: "+(e.message||e)); return; }
    }
    STATE.users.push(u);
    logActivity("AUTH", session.callsign, session.name+" created guard account "+cs+" ("+name+")");
    persist();
  });
  document.querySelectorAll("[data-reset-pin]").forEach(function(b){
    b.addEventListener("click", async function(){
      var cs=b.getAttribute("data-reset-pin");
      if(DB.configured){
        try{ await DB.auth.resetPin(cs); }
        catch(e){ toast("Couldn't reset the PIN: "+(e.message||e)); return; }
      }
      logActivity("AUTH", session.callsign, session.name+" reset the PIN for "+cs+" — change required at next sign-in");
      toast("PIN reset to 1234 for "+cs); persist();
    });
  });
  document.querySelectorAll("[data-toggle-active]").forEach(function(b){
    b.addEventListener("click", async function(){
      var cs=b.getAttribute("data-toggle-active"); var u=STATE.users.find(function(x){return x.callsign===cs;});
      var next = !u.active;
      if(DB.configured){
        try{ await DB.auth.setUserActive(cs, next); }
        catch(e){ toast("Couldn't update the account: "+(e.message||e)); return; }
      }
      u.active=next; logActivity("AUTH", session.callsign, (u.active?"Reactivated":"Deactivated")+" account "+cs);
      persist();
    });
  });
  document.querySelectorAll(".mapAccessSel").forEach(function(sel){
    sel.addEventListener("change", async function(){
      var cs = sel.getAttribute("data-user"); var postId = sel.value;
      var u = STATE.users.find(function(x){return x.callsign===cs;});
      if(DB.configured){
        try{ await DB.auth.setAssignedPost(cs, postId); }
        catch(e){ toast("Couldn't update map access: "+(e.message||e)); return; }
      }
      var post = postId ? STATE.posts.find(function(p){return p.id===postId;}) : null;
      var label = postId ? (post ? post.id+" — "+post.name : postId) : "All Sites";
      u.assignedPostId = postId;
      logActivity("AUTH", session.callsign, session.name+" set map access for "+cs+" to "+label);
      // If this is the signed-in account, apply the new scope to this browser's session right away.
      if(session.callsign===cs){ session.assignedPostId = postId; sessionStorage.setItem("cad_session", JSON.stringify(session)); }
      persist();
    });
  });
}

/* ---------------- LIVE MAP (Dispatch / Supervisors / Admins only) ----------------
   Plots each guard's most recent GPS ping (STATE.guardLocations, refreshed automatically —
   see startLiveTracking in app.js) on a free Leaflet + OpenStreetMap map, no API key or billing
   account required. "Show trail" overlays that guard's checkpoint-scan history for today from
   STATE.checkpointScans. Gated to role SUPV in two places: the sidebar (renderShell) hides the
   nav item for guards, and this function itself refuses to render for anyone else — the same
   belt-and-suspenders pattern already used for the other SUPV-only actions in this file. Like
   every other table in this app, the underlying data is still reachable by anyone with the
   Supabase anon key (see the SECURITY NOTE in schema.sql) — this is a UI-level restriction,
   not a database-level one.

   Within that SUPV gate, each account is further scoped by session.assignedPostId (set per
   account from the Users tab's "Map access" control, src/part3.js renderUsers/wireUsers): a
   Supervisor assigned to a site only sees that site's guards, matched against which post each
   guard's unit is currently posted to (units[].post). Left unassigned — the default — an
   account sees every site, i.e. Dispatch/Admin. */
var RIDGECREST_CENTER = [35.6225, -117.6709]; // Ridgecrest, CA — default view before any pings arrive
var _liveMapView = null; // remembers pan/zoom across re-renders (the view's DOM, and the map with it, is rebuilt on every render() call)
function mapScopePostId(){ return (session && session.assignedPostId) || ""; }
function mapScopeLabel(postId){
  if(!postId) return "All Sites";
  var post = STATE.posts.find(function(p){return p.id===postId;});
  return post ? post.id+" — "+post.name : postId;
}
/* Guards currently posted (units[].post) to the scoped site; unscoped (Dispatch/Admin) returns everyone. */
function scopedGuardLocations(){
  var locs = STATE.guardLocations||[];
  var postId = mapScopePostId();
  if(!postId) return locs;
  var atSite = {};
  STATE.units.forEach(function(u){ if(u.post===postId) atSite[u.callsign]=1; });
  return locs.filter(function(l){ return atSite[l.callsign]; });
}
function renderMap(){
  if(!session || session.role!=="SUPV"){
    return '<div class="card"><div class="empty-state">This view is limited to Dispatch, Supervisors, and Admins.</div></div>';
  }
  var postId = mapScopePostId();
  var scopeLabel = mapScopeLabel(postId);
  var locs = scopedGuardLocations();
  var trailCs = uiState.mapTrailFor||"";
  var html = '<div class="section-head"><h2>Live Guard Map</h2><span class="meta">'+locs.length+' reporting · '+escapeHtml(scopeLabel)+'</span></div>';
  html += '<div class="two-col">';
  html += '<div class="card"><div style="font-weight:700;">On the Map</div>'+
    '<div class="small-muted" style="margin-bottom:10px;">'+(postId ? 'Scoped to '+escapeHtml(scopeLabel)+' — set from the Users tab.' : 'All sites — Dispatch/Admin view.')+'</div>';
  if(!locs.length){
    html += '<div class="empty-state">'+(postId ? 'No live positions yet at '+escapeHtml(scopeLabel)+'.' : 'No live positions yet.')+' A pin appears here automatically once a guard\'s device shares its location while they\'re signed in.</div>';
  } else {
    html += locs.slice().sort(function(a,b){ return new Date(b.updatedAt)-new Date(a.updatedAt); }).map(function(l){
      var stale = (Date.now()-new Date(l.updatedAt).getTime()) > 5*60000;
      return '<div class="checkbox-row" style="justify-content:space-between;">'+
        '<div><div>'+escapeHtml(l.callsign)+'</div><div class="small-muted">updated '+fmtAgo(l.updatedAt)+(stale?' <span class="overdue-badge">STALE</span>':'')+'</div></div>'+
        '<button class="btn sm '+(trailCs===l.callsign?"primary":"")+'" data-map-trail="'+escapeHtml(l.callsign)+'">'+(trailCs===l.callsign?"Hide trail":"Show trail")+'</button></div>';
    }).join("");
  }
  html += '<div class="small-muted" style="margin-top:12px;">Positions refresh roughly every 45 seconds while a guard is signed in on their device. "Show trail" overlays today\'s checkpoint-scan path for that guard.</div>';
  html += '</div>';
  html += '<div class="card" style="padding:0;overflow:hidden;"><div id="liveMap" style="height:640px;width:100%;"></div></div>';
  html += '</div>';
  return html;
}
function wireMap(){
  if(!session || session.role!=="SUPV") return;
  document.querySelectorAll("[data-map-trail]").forEach(function(b){
    b.addEventListener("click", function(){
      var cs = b.getAttribute("data-map-trail");
      uiState.mapTrailFor = (uiState.mapTrailFor===cs) ? "" : cs;
      render();
    });
  });
  var el = document.getElementById("liveMap");
  if(!el || typeof L==="undefined") return;
  var map = L.map("liveMap");
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  var pts = [];
  scopedGuardLocations().forEach(function(l){
    if(l.lat==null || l.lng==null) return;
    var stale = (Date.now()-new Date(l.updatedAt).getTime()) > 5*60000;
    var marker = L.circleMarker([l.lat,l.lng], {radius:8, color: stale?"#8a8f98":"#3fa9f5", fillColor: stale?"#8a8f98":"#3fa9f5", fillOpacity:.85, weight:2});
    marker.bindPopup("<b>"+escapeHtml(l.callsign)+"</b><br>Updated "+fmtAgo(l.updatedAt)+(l.accuracy?"<br>±"+Math.round(l.accuracy)+"m":""));
    marker.addTo(map);
    pts.push([l.lat,l.lng]);
  });
  if(uiState.mapTrailFor){
    var todayPrefix = new Date().toISOString().slice(0,10);
    var trail = (STATE.checkpointScans||[]).filter(function(s){
      return s.callsign===uiState.mapTrailFor && s.lat!=null && s.lng!=null && (s.at||"").slice(0,10)===todayPrefix;
    }).slice().sort(function(a,b){ return new Date(a.at)-new Date(b.at); });
    if(trail.length){
      L.polyline(trail.map(function(s){ return [s.lat,s.lng]; }), {color:"#f5a83f", weight:3, opacity:.8, dashArray:"4,5"}).addTo(map);
      trail.forEach(function(s){ pts.push([s.lat,s.lng]); });
      var last = trail[trail.length-1];
      L.circleMarker([last.lat,last.lng], {radius:5, color:"#f5a83f", fillColor:"#f5a83f", fillOpacity:1}).addTo(map)
        .bindPopup("Last scan — "+escapeHtml(uiState.mapTrailFor)+"<br>"+fmtShort(last.at));
    }
  }
  if(_liveMapView){ map.setView(_liveMapView.center, _liveMapView.zoom); }
  else if(pts.length){ map.fitBounds(pts, {padding:[30,30], maxZoom:16}); }
  else { map.setView(RIDGECREST_CENTER, 12); }
  map.on("moveend", function(){ _liveMapView = {center: map.getCenter(), zoom: map.getZoom()}; });
}

document.addEventListener("DOMContentLoaded", init);
})();
