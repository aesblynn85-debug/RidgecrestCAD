/* Ridgecrest CAD — Supabase persistence layer.
   Loads the whole app state from Postgres on startup, and exposes small
   per-entity write functions that each mutation calls right after updating
   the in-memory STATE object, so writes are targeted (one row) instead of
   re-publishing the entire app state on every change. */
(function(){
"use strict";

var CFG = window.__CAD_CONFIG || {};
var CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY &&
  CFG.SUPABASE_URL.indexOf("REPLACE_WITH") !== 0 && CFG.SUPABASE_ANON_KEY.indexOf("REPLACE_WITH") !== 0);

var sb = CONFIGURED ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 5 } }
}) : null;

function must(){ if(!sb) throw new Error("Supabase is not configured — set SUPABASE_URL/SUPABASE_ANON_KEY in src/config.js"); }
function chk(res){ if(res.error) throw res.error; return res.data; }

/* ---------- mappers: DB row (snake_case) <-> app object (camelCase), matching the original STATE shape ---------- */
function callFromRow(r){
  return {id:r.id, code:r.code||"", nature:r.nature||"", priority:r.priority, post:r.post||"", location:r.location||"",
    reportingParty:r.reporting_party||"", callback:r.callback||"", receivedVia:r.received_via||"", status:r.status,
    createdAt:r.created_at, assignedUnit:r.assigned_unit||"", narrativeSupplements:[]};
}
function callToRow(c){
  return {id:c.id, code:c.code||"", nature:c.nature||"", priority:c.priority, post:c.post||"", location:c.location||"",
    reporting_party:c.reportingParty||"", callback:c.callback||"", received_via:c.receivedVia||"", status:c.status,
    created_at:c.createdAt, assigned_unit:c.assignedUnit||""};
}
function unitFromRow(r){
  return {callsign:r.callsign, name:r.name, type:r.type, status:r.status, statusSince:r.status_since, post:r.post||"",
    shift:r.shift||"", homeCallsign:r.home_callsign||""};
}
function unitToRow(u){
  return {callsign:u.callsign, name:u.name, type:u.type, status:u.status, status_since:u.statusSince, post:u.post||"",
    shift:u.shift||"", home_callsign:u.homeCallsign||""};
}
function truckFromRow(r){
  return {id:r.id, company:r.company||"", driver:r.driver||"", trailer:r.trailer||"", tractor:r.tractor||"",
    post:r.post||"", purpose:r.purpose||"", dock:r.dock||"", seal:r.seal||"", bol:r.bol||"", license:r.license||"",
    notes:r.notes||"", timeIn:r.time_in, timeOut:r.time_out};
}
function truckToRow(t){
  return {id:t.id, company:t.company||"", driver:t.driver||"", trailer:t.trailer||"", tractor:t.tractor||"",
    post:t.post||"", purpose:t.purpose||"", dock:t.dock||"", seal:t.seal||"", bol:t.bol||"", license:t.license||"",
    notes:t.notes||"", time_in:t.timeIn, time_out:t.timeOut};
}
function reportFromRow(r){
  return {id:r.id, type:r.type||"", typeLabel:r.type_label||"", status:r.status, attachToCall:r.attach_to_call||"",
    post:r.post||"", occurred:r.occurred, location:r.location||"", subject:r.subject||"", narrative:r.narrative||"",
    involvedParties:r.involved_parties||"", witnesses:r.witnesses||"", propertyDamage:r.property_damage||"",
    estLoss:r.est_loss||"", actionTaken:r.action_taken||"",
    notifications:{injury:!!r.notify_injury, ems:!!r.notify_ems, police:!!r.notify_police},
    whoElseNotified:r.who_else_notified||"", forceUsed:!!r.force_used, writtenBy:r.written_by||"",
    writtenByCallsign:r.written_by_callsign||"", submittedAt:r.submitted_at, reviewedAt:r.reviewed_at,
    reviewedBy:r.reviewed_by, supervisorNotes:r.supervisor_notes||""};
}
function reportToRow(r){
  return {id:r.id, type:r.type||"", type_label:r.typeLabel||"", status:r.status, attach_to_call:r.attachToCall||"",
    post:r.post||"", occurred:r.occurred, location:r.location||"", subject:r.subject||"", narrative:r.narrative||"",
    involved_parties:r.involvedParties||"", witnesses:r.witnesses||"", property_damage:r.propertyDamage||"",
    est_loss:r.estLoss||"", action_taken:r.actionTaken||"",
    notify_injury:!!(r.notifications&&r.notifications.injury), notify_ems:!!(r.notifications&&r.notifications.ems),
    notify_police:!!(r.notifications&&r.notifications.police), who_else_notified:r.whoElseNotified||"",
    force_used:!!r.forceUsed, written_by:r.writtenBy||"", written_by_callsign:r.writtenByCallsign||"",
    submitted_at:r.submittedAt, reviewed_at:r.reviewedAt, reviewed_by:r.reviewedBy, supervisor_notes:r.supervisorNotes||""};
}
function pvFromRow(r){
  return {id:r.id, vtype:r.vtype||"", call:r.call_id||"", reportId:r.report_id||"", post:r.post||"", occurred:r.occurred,
    locationInLot:r.location_in_lot||"", plate:r.plate||"", plateState:r.plate_state||"", vehicleDesc:r.vehicle_desc||"",
    driver:r.driver||"", narrative:r.narrative||"", actionTaken:r.action_taken||"",
    notifications:{police:!!r.notify_police, propMgmt:!!r.notify_prop_mgmt, tow:!!r.notify_tow},
    whoElseNotified:r.who_else_notified||"", status:r.status, writtenBy:r.written_by||"",
    writtenByCallsign:r.written_by_callsign||"", submittedAt:r.submitted_at, reviewedAt:r.reviewed_at,
    reviewedBy:r.reviewed_by, supervisorNotes:r.supervisor_notes||""};
}
function pvToRow(v){
  return {id:v.id, vtype:v.vtype||"", call_id:v.call||null, report_id:v.reportId||null, post:v.post||"", occurred:v.occurred,
    location_in_lot:v.locationInLot||"", plate:v.plate||"", plate_state:v.plateState||"", vehicle_desc:v.vehicleDesc||"",
    driver:v.driver||"", narrative:v.narrative||"", action_taken:v.actionTaken||"",
    notify_police:!!(v.notifications&&v.notifications.police), notify_prop_mgmt:!!(v.notifications&&v.notifications.propMgmt),
    notify_tow:!!(v.notifications&&v.notifications.tow), who_else_notified:v.whoElseNotified||"", status:v.status,
    written_by:v.writtenBy||"", written_by_callsign:v.writtenByCallsign||"", submitted_at:v.submittedAt,
    reviewed_at:v.reviewedAt, reviewed_by:v.reviewedBy, supervisor_notes:v.supervisorNotes||""};
}
function activityFromRow(r){ return {at:r.at, type:r.type, actor:r.actor, text:r.text}; }

/* ---------- load everything into the STATE shape the UI expects ---------- */
async function loadAllState(){
  must();
  var results = await Promise.all([
    sb.from("users_public").select("*"),
    sb.from("units").select("*"),
    sb.from("posts").select("*"),
    sb.from("checkpoints").select("*"),
    sb.from("calls").select("*").order("created_at",{ascending:false}),
    sb.from("call_supplements").select("*").order("at",{ascending:true}),
    sb.from("chat_channels").select("*"),
    sb.from("chat_messages").select("*").order("at",{ascending:true}),
    sb.from("trucks").select("*").order("time_in",{ascending:false}),
    sb.from("reports").select("*"),
    sb.from("parking_violations").select("*"),
    sb.from("police_on_property").select("*"),
    sb.from("activity_log").select("*").order("at",{ascending:false}).limit(500),
    sb.from("counters").select("*")
  ]);
  results.forEach(chk);
  var users = results[0].data, units = results[1].data, posts = results[2].data, checkpoints = results[3].data,
    calls = results[4].data, supplements = results[5].data, channels = results[6].data, messages = results[7].data,
    trucks = results[8].data, reports = results[9].data, pvs = results[10].data, police = results[11].data,
    activity = results[12].data, counters = results[13].data;

  var callsOut = calls.map(callFromRow);
  supplements.forEach(function(s){
    var c = callsOut.find(function(x){return x.id===s.call_id;});
    if(c) c.narrativeSupplements.push({at:s.at, by:s.by, text:s.text});
  });
  var postsOut = posts.map(function(p){
    return {id:p.id, name:p.name, kind:p.kind||"", org:p.org||"", address:p.address||"",
      checkpoints: checkpoints.filter(function(c){return c.post_id===p.id;}).map(function(c){
        return {id:c.id, name:c.name, intervalMin:c.interval_min, lastScan:c.last_scan, lastScanBy:c.last_scan_by};
      })};
  });
  var counterMap = {}; counters.forEach(function(c){ counterMap[c.key]=c.value; });

  return {
    meta: {site:"Ridgecrest Threat Advisory", createdAt:null},
    users: users.map(function(u){ return {callsign:u.callsign, name:u.name, role:u.role, title:u.title||"",
      active:u.active, lastSignIn:u.last_sign_in, mustChangePin:u.must_change_pin}; }),
    units: units.map(unitFromRow),
    posts: postsOut,
    calls: callsOut,
    callSeq: counterMap.call||0,
    chat: { channels: channels.map(function(c){return {id:c.id,name:c.name,desc:c.description||""};}), messages: messages.map(function(m){
      return {channel:m.channel_id, from:m.from_callsign||"", name:m.name||"", bolo:!!m.bolo, text:m.text, at:m.at};
    })},
    trucks: trucks.map(truckFromRow),
    reportSeq: counterMap.report||0,
    reports: reports.map(reportFromRow),
    policeOnProperty: police.map(function(p){return {id:p.id, arrivedAt:p.arrived_at, departedAt:p.departed_at,
      agency:p.agency||"", officer:p.officer||"", reason:p.reason||"", notes:p.notes||""};}),
    parkingSeq: counterMap.parking||0,
    parkingViolations: pvs.map(pvFromRow),
    activityLog: activity.map(activityFromRow)
  };
}

/* ---------- auth (PINs are hashed server-side; the client never sees pin_hash) ---------- */
async function verifyPin(callsign, pin){ must(); return chk(await sb.rpc("verify_pin", {p_callsign:callsign, p_pin:pin})); }
async function setPin(callsign, newPin){ must(); chk(await sb.rpc("set_pin", {p_callsign:callsign, p_new_pin:newPin})); }
async function createGuard(callsign, name, pin){ must(); chk(await sb.rpc("create_guard", {p_callsign:callsign, p_name:name, p_pin:pin||"1234"})); }
async function resetPin(callsign){ must(); chk(await sb.rpc("reset_pin", {p_callsign:callsign})); }
async function recordSignIn(callsign){ must(); chk(await sb.rpc("record_sign_in", {p_callsign:callsign})); }
async function nextCounter(key){ must(); return chk(await sb.rpc("next_counter", {counter_key:key})); }
async function setUserActive(callsign, active){ must(); chk(await sb.from("users").update({active:active}).eq("callsign",callsign)); }

/* ---------- generic row writers ---------- */
async function insertRow(table, row){ must(); chk(await sb.from(table).insert(row)); }
async function updateRow(table, idCol, idVal, patch){ must(); chk(await sb.from(table).update(patch).eq(idCol, idVal)); }
async function deleteRow(table, idCol, idVal){ must(); chk(await sb.from(table).delete().eq(idCol, idVal)); }
async function upsertRow(table, row){ must(); chk(await sb.from(table).upsert(row)); }

/* ---------- per-entity write helpers used by app.js/part2.js/part3.js ---------- */
var DB = {
  configured: CONFIGURED,
  loadAllState: loadAllState,
  auth: {verifyPin:verifyPin, setPin:setPin, createGuard:createGuard, resetPin:resetPin, recordSignIn:recordSignIn, setUserActive:setUserActive},
  counters: {next:nextCounter},
  calls: {
    insert: function(c){ return insertRow("calls", callToRow(c)); },
    update: function(id, patch){ return updateRow("calls","id",id,patch); },
    addSupplement: function(callId, supp){ return insertRow("call_supplements", {call_id:callId, at:supp.at, by:supp.by, text:supp.text}); }
  },
  units: {
    insert: function(u){ return insertRow("units", unitToRow(u)); },
    update: function(callsign, patch){ return updateRow("units","callsign",callsign,patch); },
    remove: function(callsign){ return deleteRow("units","callsign",callsign); }
  },
  checkpoints: {
    scan: function(cpId, by){ return updateRow("checkpoints","id",cpId,{last_scan:new Date().toISOString(), last_scan_by:by}); }
  },
  chat: {
    addChannel: function(ch){ return insertRow("chat_channels", {id:ch.id, name:ch.name, description:ch.desc||""}); },
    addMessage: function(m){ return insertRow("chat_messages", {channel_id:m.channel, from_callsign:m.from||"", name:m.name||"", bolo:!!m.bolo, text:m.text, at:m.at}); }
  },
  trucks: {
    insert: function(t){ return insertRow("trucks", truckToRow(t)); },
    checkOut: function(id, timeOut){ return updateRow("trucks","id",id,{time_out:timeOut}); }
  },
  reports: {
    insert: function(r){ return insertRow("reports", reportToRow(r)); },
    update: function(id, patch){ return updateRow("reports","id",id,patch); }
  },
  parking: {
    insert: function(v){ return insertRow("parking_violations", pvToRow(v)); },
    update: function(id, patch){ return updateRow("parking_violations","id",id,patch); }
  },
  activity: {
    insert: function(entry){ return insertRow("activity_log", {at:entry.at, type:entry.type, actor:entry.actor, text:entry.text}); }
  },
  /* Subscribe to live changes from other guards' sessions. onChange is called with the
     table name whenever a row changes; callers typically refetch that slice and re-render. */
  subscribeRealtime: function(onChange){
    if(!sb) return null;
    var tables = ["units","calls","call_supplements","chat_messages","trucks","reports","parking_violations","checkpoints","activity_log"];
    var channel = sb.channel("cad-live");
    tables.forEach(function(t){
      channel.on("postgres_changes", {event:"*", schema:"public", table:t}, function(payload){ onChange(t, payload); });
    });
    channel.subscribe();
    return channel;
  }
};

window.__CAD_DB = DB;
})();
