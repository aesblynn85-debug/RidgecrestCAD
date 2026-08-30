/* Ridgecrest CAD — rebuilt console. Single-page app driven by STATE, persisted to Supabase. */
(function(){
"use strict";

/* ---------------- constants ---------------- */
var NAV = [
  {id:"dispatch", label:"Dispatch", ic:"◉"},
  {id:"units", label:"Units", ic:"▤"},
  {id:"sites", label:"Posts & Tours", ic:"◇"},
  {id:"chat", label:"Patrol Chat", ic:"✇"},
  {id:"radio", label:"Radio PTT", ic:"▶"},
  {id:"trucks", label:"Truck Log", ic:"▢"},
  {id:"parking", label:"Parking Lot Violations", ic:"⚠"},
  {id:"reports", label:"Field Reports", ic:"☷"},
  {id:"log", label:"Activity Log", ic:"≡"},
  {id:"users", label:"Users", ic:"☺"}
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
      '<ul id="navlist">'+ NAV.map(function(n){
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
    case "chat": return renderChat();
    case "radio": return renderRadio();
    case "trucks": return renderTrucks();
    case "parking": return renderParking();
    case "reports": return renderReports();
    case "log": return renderLog();
    case "users": return renderUsers();
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
    session = {callsign:u.callsign, name:u.name, role:u.role};
    sessionStorage.setItem("cad_session", JSON.stringify(session));
    u.lastSignIn = nowIso();
    logActivity("AUTH", u.callsign, u.name+" ("+u.callsign+") signed in");
    if(DB.configured) DB.auth.recordSignIn(u.callsign).catch(function(e){ console.warn("record_sign_in failed", e); });
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
  if(route==="chat") wireChat();
  if(route==="trucks") wireTrucks();
  if(route==="parking") wireParking();
  if(route==="reports") wireReports();
  if(route==="log") wireLog();
  if(route==="users") wireUsers();
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
  var realtimeTimer = null;
  DB.subscribeRealtime(function(){
    // Another guard's session changed something. Refetch everything (simple and infrequent enough
    // to be cheap) but debounce a burst of events into one refresh, and never yank the screen out
    // from under someone mid-typing — apply the fresh state but skip the re-render until they're done.
    if(realtimeTimer) clearTimeout(realtimeTimer);
    realtimeTimer = setTimeout(function(){
      DB.loadAllState().then(function(fresh){
        STATE = fresh; window.__CAD.STATE = STATE;
        var active = document.activeElement, tag = active && active.tagName;
        if(tag==="INPUT" || tag==="TEXTAREA" || tag==="SELECT") return; // apply silently; next render will pick it up
        render();
      }).catch(function(e){ console.warn("realtime refresh failed", e); });
    }, 700);
  });
}
document.addEventListener("DOMContentLoaded", init);
})();
