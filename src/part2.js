/* ---------------- DISPATCH ---------------- */
function renderDispatch(){
  var C = window.__CAD;
  var queue = STATE.calls.filter(function(c){ return c.status!=="CLEARED" && visibleToMe(c.post); }).sort(function(a,b){ return a.priority-b.priority || new Date(a.createdAt)-new Date(b.createdAt); });
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
  visiblePosts().map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(mySitePostId()===p.id?"selected":"")+'>'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
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
        '<div class="meta">@ '+escapeHtml(c.post||"—")+' · <span class="pill '+(c.status==="DISPATCHED"?"blue":c.status==="ENROUTE"?"blue":c.status==="ONSCENE"?"ok":"muted")+'">'+c.status+'</span>'+((c.assignedUnits&&c.assignedUnits.length)?" · "+escapeHtml(c.assignedUnits.join(", ")):"")+'</div>'+
        '</div>';
    }).join("");
  }
  html += '</div>';

// Unit status
html += '<div class="card"><div class="section-head"><h2>Unit Status</h2><span class="meta">'+STATE.units.filter(function(u){return unitVisible(u) && (u.status!=="OFFDUTY"&&u.status!=="ENDSHIFT");}).length+' on duty</span></div>';
  C.UNIT_STATUSES.map(function(s){return s[0];}).forEach(function(st){
var us = STATE.units.filter(function(u){ return u.status===st && unitVisible(u); });
if(!us.length) return;
html += '<div class="small-muted" style="margin:10px 0 4px;text-transform:uppercase;letter-spacing:.05em;">'+escapeHtml(C.unitStatusLabel(st))+' ('+us.length+')</div>';
html += us.map(function(u){
return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid hsl(var(--border)/.5);">'+
'<div><div style="font-weight:600;">'+escapeHtml(u.callsign)+' '+escapeHtml(u.name)+'</div><div class="small-muted">'+escapeHtml(u.type)+' · '+escapeHtml(u.post||"")+' · '+escapeHtml(u.shift||"")+'</div></div>'+
'<select class="unitStatusSel" data-unit="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:11px;padding:4px 6px;">'+
C.UNIT_STATUSES.map(function(s){ return '<option value="'+s[0]+'" '+(s[0]===u.status?"selected":"")+'>'+escapeHtml(s[1])+'</option>'; }).join("")+
'</select></div>';
}).join("");
});

html += '<div class="small-muted" style="margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em;">Live Log</div><div style="max-height:260px;overflow-y:auto;">';
  // Daily Activity Report entries stay in the Activity Log (Supervisor/Admin) — not the Live Log guards see.
  html += STATE.activityLog.filter(function(l){ return activityVisible(l) && (l.type!=="DAR" || canSeeRoute("log")); }).slice(0,12).map(function(l){
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
  var assigned = c.assignedUnits || [];
  var availUnits = STATE.units.filter(function(u){ return u.status==="AVAILABLE" && unitVisible(u); });
  var unitsHtml = assigned.length ? assigned.map(function(cs){
    var u = STATE.units.find(function(x){return x.callsign===cs;});
    var st = u ? u.status : "?";
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">'+
      '<span>'+escapeHtml(cs)+(u?" — "+escapeHtml(u.name):"")+' <span class="pill '+(st==="ONSCENE"?"ok":(st==="ENROUTE"||st==="DISPATCHED")?"blue":"muted")+'">'+escapeHtml(C.unitStatusLabel(st))+'</span></span>'+
      '<button class="btn sm ghost" data-action="unassignUnit" data-call="'+c.id+'" data-unit="'+escapeHtml(cs)+'">Remove</button>'+
      '</div>';
  }).join("") : '<div class="small-muted">No units assigned yet.</div>';
  var pickerHtml = availUnits.length ?
    '<div style="display:flex;gap:6px;margin-top:8px;"><select id="unitPicker" style="flex:1;">'+
    availUnits.map(function(u){ return '<option value="'+escapeHtml(u.callsign)+'">'+escapeHtml(u.callsign+" — "+u.name)+'</option>'; }).join("")+
    '</select><button class="btn sm" data-action="assignUnit" data-call="'+c.id+'">Add unit</button></div>' :
    '<div class="small-muted" style="margin-top:8px;">No available units to assign.</div>';
  return '<div class="modal-backdrop" data-close-modal="1"><div class="modal" onclick="event.stopPropagation()">'+
    '<button class="close" data-action="closeCall">✕</button>'+
    '<div class="rtaid">#'+c.id+'</div><h2>'+escapeHtml(c.nature||c.code||"")+'</h2>'+
    '<div class="kv-grid">'+
    '<div><div class="k">Priority</div><div class="v">P'+c.priority+' — '+C.PRIORITIES[c.priority]+'</div></div>'+
    '<div><div class="k">Status</div><div class="v">'+c.status+'</div></div>'+
    '<div><div class="k">Post</div><div class="v">'+escapeHtml(c.post||"—")+'</div></div>'+
    '<div><div class="k">Location</div><div class="v">'+escapeHtml(c.location||"—")+'</div></div>'+
    '<div><div class="k">Created</div><div class="v">'+fmtDT(c.createdAt)+'</div></div>'+

    '</div>'+
    '<div class="field-block"><div class="k">Assigned Units ('+assigned.length+')</div>'+unitsHtml+pickerHtml+'</div>'+'<div class="field-block"><div class="k">Narrative Supplements</div>'+narr+'</div>'+
    '<label class="field"><span class="lbl">Add supplement</span><textarea id="callSupp" rows="2"></textarea></label>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
    '<button class="btn sm" data-action="addSupp" data-call="'+c.id+'">Add note</button>'+
    '<button class="btn sm" data-action="callStatus" data-call="'+c.id+'" data-to="ENROUTE">Enroute to call</button>'+
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
    var exactLoc = fd.get("location")||""; var postAddr = post ? (post.address||"") : ""; var locText = postAddr && exactLoc ? (postAddr+" — "+exactLoc) : (postAddr || exactLoc); var call = {
      id:id, code:fd.get("code")||"", nature:fd.get("nature")||fd.get("code")||"", priority:selectedPrio,
      post: postId ? (postId+" "+post.name) : "", location: locText, reportingParty: fd.get("rp")||"",
      callback: fd.get("callback")||"", receivedVia: selectedVia, status:"PENDING", createdAt: nowIso(),
      assignedUnits:[], narrativeSupplements:[]
    };
    STATE.calls.unshift(call);
    logActivity("INCIDENT", "DISPATCH", "CALL CREATED "+id+" — P"+selectedPrio+" "+(call.code||call.nature)+(call.post?" @ "+call.post:""));
    form.reset();
    persist(function(){ return DB.calls.insert(call); }, "call "+id);
  });
  var clearBtn = document.querySelector('[data-action="clearIntake"]');
  if(clearBtn) clearBtn.addEventListener("click", function(){ form.reset(); });

wireCallModal();
  document.querySelectorAll(".unitStatusSel").forEach(function(sel){
    sel.addEventListener("change", function(){
      var cs=sel.getAttribute("data-unit"); var u=STATE.units.find(function(x){return x.callsign===cs;});
      var from=u.status; u.status=sel.value; u.statusSince=nowIso();
      logActivity("UNIT","DISPATCH","Unit "+cs+" status "+from+" → "+sel.value);
      recordUnitStatus(u, from, u.status);
      persist(function(){ return DB.units.update(cs, {status:u.status, status_since:u.statusSince}); }, "unit "+cs+" status");
    });
  });
}

function wireCallModal(){
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
      var assignedCs = c.assignedUnits || [];
      var unitWrites = [];
      if(to==="ENROUTE" || to==="ONSCENE"){
        assignedCs.forEach(function(cs){
         var u = STATE.units.find(function(x){return x.callsign===cs;});
          if(u && u.status!==to){
            var ufrom=u.status; u.status=to; u.statusSince=nowIso();
            logActivity("UNIT","DISPATCH","Unit "+cs+" status "+ufrom+" → "+to);
            recordUnitStatus(u, ufrom, to, id);
            unitWrites.push(DB.units.update(cs, {status:to, status_since:u.statusSince}));
          }
        });
      }

                       if(to==="CLEARED"){
                         assignedCs.forEach(function(cs){
                           var u = STATE.units.find(function(x){return x.callsign===cs;});
                           if(u && u.status!=="AVAILABLE"){
                             var ufrom=u.status; u.status="AVAILABLE"; u.statusSince=nowIso();
                             logActivity("UNIT","DISPATCH","Unit "+cs+" status "+ufrom+" → AVAILABLE");
                             recordUnitStatus(u, ufrom, "AVAILABLE", id);
                             unitWrites.push(DB.units.update(cs, {status:"AVAILABLE", status_since:u.statusSince}));
                           }
                         });
                         uiState.openCallId=null;
                       }
      persist(function(){ return Promise.all([DB.calls.update(id, {status:to})].concat(unitWrites)); }, "call "+id+" status");
    });
  });
  document.querySelectorAll('[data-action="assignUnit"]').forEach(function(b){
    b.addEventListener("click", function(){
      var id = b.getAttribute("data-call"); var c=STATE.calls.find(function(x){return x.id===id;});
      var picker = document.getElementById("unitPicker");
      if(!picker || !picker.value){ toast("No available units."); return; }
      var cs = picker.value;
      var u = STATE.units.find(function(x){return x.callsign===cs;});
      if(!u || u.status!=="AVAILABLE") return;
      c.assignedUnits = c.assignedUnits || [];
      if(c.assignedUnits.indexOf(cs)===-1) c.assignedUnits.push(cs);
      var afrom=u.status; u.status="DISPATCHED"; u.statusSince=nowIso();
      recordUnitStatus(u, afrom, "DISPATCHED", id);
      if(c.status==="PENDING") c.status="DISPATCHED";
                       logActivity("INCIDENT", session.callsign, "Unit "+cs+" dispatched to "+id);
      logActivity("UNIT", "DISPATCH", "Unit "+cs+" status AVAILABLE → DISPATCHED");
      persist(function(){ return Promise.all([
        DB.calls.update(id, {status:c.status, assigned_units:c.assignedUnits}),
        DB.units.update(cs, {status:"DISPATCHED", status_since:u.statusSince})
        ]); }, "dispatch to "+id);
    });
  });

document.querySelectorAll('[data-action="unassignUnit"]').forEach(function(b){
  b.addEventListener("click", function(){
    var id=b.getAttribute("data-call"); var cs=b.getAttribute("data-unit");
    var c=STATE.calls.find(function(x){return x.id===id;});
    c.assignedUnits = (c.assignedUnits||[]).filter(function(x){return x!==cs;});
    var u = STATE.units.find(function(x){return x.callsign===cs;});
    if(u){ var rfrom=u.status; u.status="AVAILABLE"; u.statusSince=nowIso(); recordUnitStatus(u, rfrom, "AVAILABLE", id); }
    logActivity("INCIDENT", session.callsign, "Unit "+cs+" removed from "+id);
    if(u) logActivity("UNIT","DISPATCH","Unit "+cs+" status → AVAILABLE");
    persist(function(){ return Promise.all([
      DB.calls.update(id, {assigned_units:c.assignedUnits}),
      u ? DB.units.update(cs, {status:"AVAILABLE", status_since:u.statusSince}) : Promise.resolve()
      ]); }, "unassign "+cs+" from "+id);
  });
});
}

function renderCallHistory(){
  var C = window.__CAD;
  var filter = uiState.callHistoryFilter || "ALL";
  var list = STATE.calls.filter(function(c){
    if(!visibleToMe(c.post)) return false;
    if(filter==="ACTIVE") return c.status!=="CLEARED";
    if(filter==="CLEARED") return c.status==="CLEARED";
    return true;
  }).sort(function(a,b){ return new Date(b.createdAt)-new Date(a.createdAt); });
  var html = '<div class="card"><div class="section-head"><h2>Call History</h2><span class="meta">'+list.length+' of '+STATE.calls.filter(function(c){ return visibleToMe(c.post); }).length+'</span></div>'+
    '<div class="priobtns" id="callHistFilter" style="margin-bottom:10px;">'+
    [["ALL","All"],["ACTIVE","Active"],["CLEARED","Cleared"]].map(function(f){ return '<button type="button" data-f="'+f[0]+'" class="'+(filter===f[0]?"active":"")+'">'+f[1]+'</button>'; }).join("")+
    '</div>';
  if(list.length===0){
    html += '<div class="empty-state">No calls match this filter.</div>';
  } else {
    html += list.map(function(c){
      return '<div class="list-item" data-open-call="'+c.id+'">'+
        '<div class="top"><span>#'+c.id+' · P'+c.priority+' '+escapeHtml(c.code||"")+'</span><span>'+fmtShort(c.createdAt)+'</span></div>'+
        '<div class="subj">'+escapeHtml(c.nature||c.code||"")+'</div>'+
        '<div class="meta">@ '+escapeHtml(c.post||"—")+' · <span class="pill '+(c.status==="DISPATCHED"?"blue":c.status==="ENROUTE"?"blue":c.status==="ONSCENE"?"ok":"muted")+'">'+c.status+'</span>'+((c.assignedUnits&&c.assignedUnits.length)?" · "+escapeHtml(c.assignedUnits.join(", ")):"")+'</div>'+
        '</div>';
    }).join("");
  }
  html += '</div>';
  if(uiState.openCallId){
    var oc = STATE.calls.find(function(c){ return c.id===uiState.openCallId; });
    if(oc) html += renderCallModal(oc);
  }
  return html;
}

function wireCallHistory(){
  document.querySelectorAll("#callHistFilter button").forEach(function(b){
    b.addEventListener("click", function(){ uiState.callHistoryFilter = b.getAttribute("data-f"); render(); });
  });
  wireCallModal();
}

/* ---------------- UNITS ---------------- */
function renderUnits(){
  var C = window.__CAD;
  var onDuty = STATE.units.filter(function(u){return unitVisible(u) && (u.status!=="OFFDUTY"&&u.status!=="ENDSHIFT");}).length;
  var html = '<div class="card"><div class="section-head"><h2>Guard &amp; Unit Roster</h2><span class="meta">'+onDuty+' on duty / '+STATE.units.length+' total</span></div>'+
    (isManager() ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn sm primary" data-action="addUnit">+ Add unit</button></div>' : '')+
    '<div class="small-muted" style="margin-bottom:8px;">Assigned Sites is the pool of sites a guard can work — ctrl/cmd-click to select more than one. Post is the ONE site they are on for the current shift; it also auto-fills the Post/Site field when they self-initiate a call, report, parking violation, or truck log. Guards can set their own Post from the "My Site" picker in their sidebar.</div>'+
    '<table class="datatable"><thead><tr><th>Callsign</th><th>Guard</th><th>Type</th><th>Status</th><th>Since</th><th>Assigned Sites</th><th>Post (this shift)</th><th>Shift</th><th></th></tr></thead><tbody>'+
    STATE.units.filter(unitVisible).map(function(u){
      var assigned = (STATE.unitSites||[]).filter(function(x){return x.callsign===u.callsign;}).map(function(x){return x.postId;});
      var postOptions = assigned.length ? STATE.posts.filter(function(p){return assigned.indexOf(p.id)!==-1;}) : visiblePosts();
      return '<tr><td class="mono">'+escapeHtml(u.callsign)+'</td><td>'+escapeHtml(u.name)+'</td>'+
        '<td><select class="unitTypeSel" data-unit="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:12px;padding:4px 6px;">'+
        C.UNIT_TYPES.map(function(t){ return '<option value="'+escapeHtml(t)+'" '+(t===u.type?"selected":"")+'>'+escapeHtml(t)+'</option>'; }).join("")+
        (C.UNIT_TYPES.indexOf(u.type)===-1 && u.type ? '<option value="'+escapeHtml(u.type)+'" selected>'+escapeHtml(u.type)+'</option>' : '')+
        '</select></td>'+
        '<td><span class="pill '+(u.status==="AVAILABLE"?"ok":(u.status==="OFFDUTY"||u.status==="ENDSHIFT")?"muted":u.status==="BUSY"?"warn":"blue")+'">'+escapeHtml(C.unitStatusLabel(u.status))+'</span></td>'+
        '<td class="mono small-muted">'+fmtAgo(u.statusSince)+'</td>'+

        '<td><select multiple class="unitSitesSel" data-unit="'+escapeHtml(u.callsign)+'" size="'+Math.min(4, Math.max(2, STATE.posts.length))+'" style="min-width:150px;font-size:12px;">'+
        visiblePosts().map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(assigned.indexOf(p.id)!==-1?"selected":"")+'>'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
        '</select></td>'+
        '<td><select class="unitPostSel" data-unit="'+escapeHtml(u.callsign)+'" style="width:auto;font-size:12px;padding:4px 6px;">'+
        '<option value="">— none —</option>'+
        postOptions.map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(u.post===p.id?"selected":"")+'>'+escapeHtml(p.id+" — "+p.name)+'</option>'; }).join("")+
        (u.post && !postOptions.some(function(p){return p.id===u.post;}) ? '<option value="'+escapeHtml(u.post)+'" selected>'+escapeHtml(u.post)+'</option>' : '')+
        '</select></td>'+
        '<td>'+escapeHtml(u.shift||"—")+'</td>'+
        (isManager() ? '<td><button class="btn sm ghost" data-remove-unit="'+escapeHtml(u.callsign)+'">Remove</button></td>' : '<td></td>')+'</tr>';
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

document.querySelectorAll(".unitSitesSel").forEach(function(sel){
  sel.addEventListener("change", function(){
    var cs = sel.getAttribute("data-unit");
    var selected = Array.prototype.slice.call(sel.selectedOptions).map(function(o){return o.value;});
    var current = (STATE.unitSites||[]).filter(function(x){return x.callsign===cs;}).map(function(x){return x.postId;});
    var toAdd = selected.filter(function(id){return current.indexOf(id)===-1;});
    var toRemove = current.filter(function(id){return selected.indexOf(id)===-1;});
    STATE.unitSites = (STATE.unitSites||[]).filter(function(x){return !(x.callsign===cs && toRemove.indexOf(x.postId)!==-1);});
    toAdd.forEach(function(id){ STATE.unitSites.push({callsign:cs, postId:id}); });
    var u = STATE.units.find(function(x){return x.callsign===cs;});
    if(u && u.post && selected.length && selected.indexOf(u.post)===-1){
      // current shift site is no longer in the assigned pool — clear it rather than leave a stale value
    u.post = "";
    }
    logActivity("UNIT", session.callsign, "Assigned sites for "+cs+" set to "+(selected.join(", ")||"none"));
    persist(function(){
      var writes = toAdd.map(function(id){ return DB.unitSites.assign(cs,id); })
      .concat(toRemove.map(function(id){ return DB.unitSites.unassign(cs,id); }));
      if(u) writes.push(DB.units.update(cs, {post:u.post}));
      return Promise.all(writes);
    }, "assigned sites for "+cs);
  });
});
  document.querySelectorAll(".unitPostSel").forEach(function(sel){
    sel.addEventListener("change", function(){
      var cs=sel.getAttribute("data-unit"); var u=STATE.units.find(function(x){return x.callsign===cs;});
      var from=u.post; u.post=sel.value;
      logActivity("UNIT", session?session.callsign:"DISPATCH", "Unit "+cs+" shift site "+(from||"none")+" → "+(u.post||"none"));
      persist(function(){ return DB.units.update(cs, {post:u.post}); }, "unit "+cs+" post");
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
// view is the site directory, plus creating/removing sites themselves (added — previously this
// was a read-only list with no way to add a new site to the directory).
function renderSites(){
  var html = '<div class="card"><div class="section-head"><h2>Site Directory</h2><span class="meta">'+visiblePosts().length+' sites</span></div>'+
    (isManager() ? '<div style="display:flex;justify-content:flex-end;margin-bottom:10px;"><button class="btn sm primary" data-action="addSite">+ Add site</button></div>' : '');
  if(!visiblePosts().length){
    html += '<div class="empty-state">No sites yet. Use "+ Add site" above to create the first one.</div>';
  } else {
    html += visiblePosts().map(function(p){
      var tourCount = (STATE.patrolTours||[]).filter(function(t){return t.postId===p.id && t.active;}).length;
      return '<div class="list-item">'+
        '<div class="top"><span><b>'+escapeHtml(p.id)+'</b> — '+escapeHtml(p.name)+'</span><span class="pill blue">'+escapeHtml(p.kind)+'</span></div>'+
        '<div class="meta">'+escapeHtml(p.org)+' · '+escapeHtml(p.address||"No address on file")+'</div>'+
        '<div class="small-muted" style="margin-top:4px;">'+tourCount+' active patrol tour'+(tourCount===1?"":"s")+' — see Patrol Tours</div>'+
        (isManager() ? '<div style="margin-top:8px;"><button class="btn sm ghost" data-remove-site="'+escapeHtml(p.id)+'">Remove site</button></div>' : '')+
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
  var addBtn = document.querySelector('[data-action="addSite"]');
  if(addBtn) addBtn.addEventListener("click", function(){
    var id = prompt("Site ID (short code, e.g. STEC-62)"); if(!id) return;
    id = id.trim(); if(!id) return;
    if(STATE.posts.some(function(p){return p.id===id;})){ toast("Site ID "+id+" already exists."); return; }
    var name = prompt("Site name")||""; if(!name) return;
    var kind = prompt("Site kind (e.g. Patrol Post)")||"";
    var org = prompt("Client / org name")||"";
    var address = prompt("Address")||"";
    var p = {id:id, name:name, kind:kind, org:org, address:address, checkpoints:[]};
    STATE.posts.push(p);
    logActivity("SYSTEM", session.callsign, "Post "+id+" — "+name+" added to site directory");
    persist(function(){ return DB.posts.insert(p); }, "site "+id);
  });
  document.querySelectorAll("[data-remove-site]").forEach(function(b){
    b.addEventListener("click", function(){
      var id = b.getAttribute("data-remove-site");
      if(!confirm("Remove site "+id+"? This cannot be undone and may affect units/calls referencing it.")) return;
      STATE.posts = STATE.posts.filter(function(p){return p.id!==id;});
      logActivity("SYSTEM", session.callsign, "Post "+id+" removed from site directory");
      persist(function(){ return DB.posts.remove(id); }, "site "+id+" removal");
    });
  });
}

/* ---------------- DISPATCH TRANSCRIPTS ----------------
Replaces the old Patrol Chat tab. A read-only, searchable log of every Radio PTT transmission
on the Dispatch channel: date, time, the unit that was talking, and what they said (transcribed
on the talker's own device -- see radioTranscriber below). Only Supervisor, Admin and Dispatch
accounts can open it (ROLE_NAV in app.js); canViewTranscripts() is a second line of defense. */
function canViewTranscripts(){ return !!session && (session.role==="ADMIN" || session.role==="SUPV" || session.role==="DISPATCH"); }
function fmtTxDate(iso){ var d=new Date(iso); return (d.getMonth()+1)+"/"+d.getDate()+"/"+d.getFullYear(); }
function fmtTxTime(iso){ var d=new Date(iso); var h=d.getHours(), am=h<12?"AM":"PM", h12=h%12||12; return h12+":"+String(d.getMinutes()).padStart(2,"0")+":"+String(d.getSeconds()).padStart(2,"0")+" "+am; }
function txDayKey(iso){ var d=new Date(iso); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function filteredTranscripts(){
  var f = uiState.txFilter || {};
  var q = (f.q||"").toLowerCase();
  return (STATE.radioTranscripts||[]).filter(function(t){
    if(f.date && txDayKey(t.at)!==f.date) return false;
    if(f.unit && t.callsign!==f.unit) return false;
    if(q && ((t.text||"")+" "+(t.callsign||"")+" "+(t.name||"")).toLowerCase().indexOf(q)===-1) return false;
    return true;
  }).sort(function(a,b){ return new Date(b.at)-new Date(a.at); });
}
function renderTranscripts(){
  if(!canViewTranscripts()) return '<div class="empty-state">Dispatch Transcripts is only available to Supervisor, Admin and Dispatch accounts.</div>';
  var f = uiState.txFilter || {};
  var all = STATE.radioTranscripts||[];
  var list = filteredTranscripts();
  var units = []; all.forEach(function(t){ if(t.callsign && units.indexOf(t.callsign)===-1) units.push(t.callsign); }); units.sort();
  var html = '<div class="section-head"><h2>Dispatch Transcripts</h2><span class="meta">'+list.length+' of '+all.length+' transmission'+(all.length===1?'':'s')+' · Dispatch channel</span></div>';
  html += '<div class="card" style="margin-bottom:16px;"><div class="grid2" style="gap:10px;">'+
    '<label class="field"><span class="lbl">Date</span><input type="date" id="txDate" value="'+escapeHtml(f.date||"")+'"></label>'+
    '<label class="field"><span class="lbl">Unit</span><select id="txUnit"><option value="">All units</option>'+
      units.map(function(u){ return '<option value="'+escapeHtml(u)+'"'+(f.unit===u?' selected':'')+'>'+escapeHtml(u)+'</option>'; }).join("")+
    '</select></label></div>'+
    '<label class="field"><span class="lbl">Search transcript text</span><input type="text" id="txSearch" placeholder="Words spoken, callsign or name…" value="'+escapeHtml(f.q||"")+'"></label>'+
    '<div style="display:flex;gap:8px;margin-top:8px;"><button class="btn sm primary" data-action="txApply">Filter</button><button class="btn sm" data-action="txClear">Clear</button><button class="btn sm" data-action="txCsv">Export CSV</button></div>'+
    '</div>';
  if(!list.length){
    html += '<div class="empty-state">'+(all.length ? 'No transmissions match these filters.' : 'No radio traffic yet. Every Radio PTT transmission on the Dispatch channel is transcribed and listed here automatically.')+'</div>';
    return html;
  }
  html += '<div class="card"><table class="datatable"><thead><tr><th>Date</th><th>Time</th><th>Unit</th><th>Site</th><th>Transcript</th></tr></thead><tbody>'+
    list.map(function(t){
      var secs = t.endedAt ? Math.max(1, Math.round((new Date(t.endedAt)-new Date(t.at))/1000)) : 0;
      return '<tr><td class="mono small-muted" style="white-space:nowrap;">'+fmtTxDate(t.at)+'</td>'+
        '<td class="mono small-muted" style="white-space:nowrap;">'+fmtTxTime(t.at)+(secs?'<div>'+secs+'s</div>':'')+'</td>'+
        '<td style="white-space:nowrap;"><b>'+escapeHtml(t.callsign||"—")+'</b>'+(t.name?'<div class="small-muted">'+escapeHtml(t.name)+'</div>':'')+'</td>'+
        '<td>'+escapeHtml(t.post||"—")+'</td>'+
        '<td>'+escapeHtml(t.text||"")+'</td></tr>';
    }).join("")+'</tbody></table></div>';
  return html;
}
function wireTranscripts(){
  function apply(){
    uiState.txFilter = {
      date: (document.getElementById("txDate")||{}).value||"",
      unit: (document.getElementById("txUnit")||{}).value||"",
      q: ((document.getElementById("txSearch")||{}).value||"").trim()
    };
    render();
  }
  var ap = document.querySelector('[data-action="txApply"]'); if(ap) ap.addEventListener("click", apply);
  ["txDate","txUnit"].forEach(function(id){ var el=document.getElementById(id); if(el) el.addEventListener("change", apply); });
  var srch = document.getElementById("txSearch"); if(srch) srch.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); apply(); } });
  var clr = document.querySelector('[data-action="txClear"]'); if(clr) clr.addEventListener("click", function(){ uiState.txFilter={}; render(); });
  var csv = document.querySelector('[data-action="txCsv"]'); if(csv) csv.addEventListener("click", function(){
    var rows = [["Date","Time","Unit","Name","Site","Duration (s)","Transcript"]];
    filteredTranscripts().forEach(function(t){
      var secs = t.endedAt ? Math.max(1, Math.round((new Date(t.endedAt)-new Date(t.at))/1000)) : "";
      rows.push([fmtTxDate(t.at), fmtTxTime(t.at), t.callsign, t.name, t.post, secs, t.text]);
    });
    var body = rows.map(function(r){ return r.map(function(v){ v=String(v==null?"":v); return /[",\n]/.test(v) ? '"'+v.replace(/"/g,'""')+'"' : v; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], {type:"text/csv"}));
    a.download = "dispatch_transcripts.csv";
    document.body.appendChild(a); a.click(); a.parentNode.removeChild(a);
  });
}

/* ---------------- RADIO PTT ----------------
One channel only: "Dispatch". Live push-to-talk audio is peer-to-peer WebRTC (mesh -- every
participant connects to every other participant directly), signalled over the Supabase
Realtime channel "radio:dispatch": broadcast carries offer/answer/ICE, presence tracks who is
on the channel right now. Only a public STUN server is used (no TURN/relay), so a connection
between two guards on very restrictive/symmetric NATs or a locked-down corporate firewall may
fail silently for that pair -- everyone else on the channel is unaffected.

The audio itself is never stored. While a unit holds Talk, their own browser runs speech
recognition on their mic and, when they release, saves the text as one radio_transcripts row
(date/time keyed up, callsign, name, site, text) -- shown in the Dispatch Transcripts tab.

The mic is requested when the unit joins the channel (opening the Radio PTT tab), BEFORE any
peer connections are made, so the audio track is part of every connection from the start.
(Previously the mic was added on the first Talk press, after peers were already connected,
with no renegotiation -- so other units often never received that guard's audio.) */
var RADIO_CHANNEL_ID = "dispatch";
var RADIO_CHANNEL_NAME = "Dispatch";
var radioChannel = null; // current Supabase Realtime channel object, or null if not joined
var radioChannelKey = null; // RADIO_CHANNEL_ID once joined
var radioLocalStream = null; // this unit's mic MediaStream -- muted via track.enabled except while talking
var radioMicDenied = false; // mic refused -> listen-only
var radioPeers = {}; // callsign -> RTCPeerConnection
var radioTalkers = {}; // callsign -> true while that peer is transmitting
var radioTalking = false; // am I holding Talk right now
var radioJoining = false; // guards against double-join while a join is in flight
var RADIO_ICE_SERVERS = [{urls:"stun:stun.l.google.com:19302"}];

/* A hidden sink appended directly to document.body (NOT inside #view) so remote units'
<audio> elements survive render()'s full #view innerHTML replacement. */
function radioAudioSink(){
  var el = document.getElementById("radioAudioSink");
  if(!el){
    el = document.createElement("div");
    el.id = "radioAudioSink";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return el;
}
function radioSetPeerAudio(callsign, stream){
  var id = "radioAudio-"+callsign;
  var audio = document.getElementById(id);
  if(!audio){
    audio = document.createElement("audio");
    audio.id = id;
    audio.autoplay = true;
    radioAudioSink().appendChild(audio);
  }
  audio.srcObject = stream;
}
function radioRemovePeerAudio(callsign){
  var audio = document.getElementById("radioAudio-"+callsign);
  if(audio && audio.parentNode) audio.parentNode.removeChild(audio);
}

function radioSend(payload){
  if(!radioChannel) return;
  radioChannel.send({type:"broadcast", event:"signal", payload:payload});
}

function radioClosePeer(callsign){
  var pc = radioPeers[callsign];
  if(pc){ try{ pc.close(); }catch(e){} delete radioPeers[callsign]; }
  delete radioTalkers[callsign];
  radioRemovePeerAudio(callsign);
}

function radioEnsurePeer(callsign){
  var pc = radioPeers[callsign];
  if(pc) return pc;
  pc = new RTCPeerConnection({iceServers: RADIO_ICE_SERVERS});
  radioPeers[callsign] = pc;
  if(radioLocalStream){
    radioLocalStream.getTracks().forEach(function(t){ pc.addTrack(t, radioLocalStream); });
  } else {
    // Listen-only (no mic): still ask to receive the other side's audio.
    try{ pc.addTransceiver("audio", {direction:"recvonly"}); }catch(e){}
  }
  pc.onicecandidate = function(e){
    if(e.candidate) radioSend({kind:"ice", to:callsign, from:session.callsign, candidate:e.candidate});
  };
  pc.ontrack = function(e){ radioSetPeerAudio(callsign, e.streams[0] || new MediaStream([e.track])); };
  return pc;
}

async function radioMakeOffer(callsign){
  var pc = radioEnsurePeer(callsign);
  var offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  radioSend({kind:"offer", to:callsign, from:session.callsign, sdp:offer});
}

async function radioHandleSignal(msg){
  if(!msg || msg.to !== session.callsign || msg.from === session.callsign) return;
  var from = msg.from;
  try{
    if(msg.kind === "offer"){
      var pc = radioEnsurePeer(from);
      await pc.setRemoteDescription(msg.sdp);
      var answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      radioSend({kind:"answer", to:from, from:session.callsign, sdp:answer});
    } else if(msg.kind === "answer"){
      var pc2 = radioPeers[from];
      if(pc2) await pc2.setRemoteDescription(msg.sdp);
    } else if(msg.kind === "ice"){
      var pc3 = radioPeers[from];
      if(pc3){ try{ await pc3.addIceCandidate(msg.candidate); }catch(e){ console.warn("radio ICE candidate failed", e); } }
    }
  }catch(e){ console.warn("radio signal error", e); }
}

function radioPresenceKeys(){
  if(!radioChannel) return [];
  try{ return Object.keys(radioChannel.presenceState()); }catch(e){ return []; }
}

/* Runs on every presence sync. Exactly one side of each pair initiates the offer -- whichever
callsign sorts first alphabetically -- so two units never both send offers to each other. */
function radioSyncPeersToPresence(){
  var present = radioPresenceKeys().filter(function(cs){ return cs !== session.callsign; });
  present.forEach(function(cs){
    if(!radioPeers[cs] && session.callsign < cs) radioMakeOffer(cs);
  });
  Object.keys(radioPeers).forEach(function(cs){
    if(present.indexOf(cs) === -1) radioClosePeer(cs);
  });
  render();
}

/* Ask for the mic once (kept muted until Talk is held). Resolves either way; on refusal the
unit joins listen-only and the Talk button explains why. */
function radioEnsureMic(){
  if(radioLocalStream) return Promise.resolve(true);
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ radioMicDenied = true; return Promise.resolve(false); }
  return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}).then(function(s){
    radioLocalStream = s;
    radioMicDenied = false;
    s.getAudioTracks().forEach(function(t){ t.enabled = false; });
    return true;
  }).catch(function(){ radioMicDenied = true; return false; });
}

function radioJoinDispatch(){
  if((radioChannelKey === RADIO_CHANNEL_ID && radioChannel) || radioJoining) return Promise.resolve();
  radioJoining = true;
  return radioEnsureMic().then(function(){ return radioLeaveChannel(); }).then(function(){
    return new Promise(function(resolve){
      var ch = DB.radio.channel("radio:"+RADIO_CHANNEL_ID, {config:{broadcast:{self:false}, presence:{key:session.callsign}}});
      ch.on("broadcast", {event:"signal"}, function(msg){ radioHandleSignal(msg.payload); });
      ch.on("broadcast", {event:"talk"}, function(msg){
        var p = msg.payload;
        if(p && p.callsign !== session.callsign){ radioTalkers[p.callsign] = !!p.talking; render(); }
      });
      ch.on("presence", {event:"sync"}, function(){ radioSyncPeersToPresence(); });
      ch.on("presence", {event:"leave"}, function(payload){
        (payload.leftPresences||[]).forEach(function(p){
          var cs = (p && (p.callsign || p.key)) || "";
          if(cs) radioClosePeer(cs);
        });
      });
      ch.subscribe(function(status){
        if(status === "SUBSCRIBED"){
          ch.track({callsign:session.callsign, name:session.name});
          radioChannel = ch;
          radioChannelKey = RADIO_CHANNEL_ID;
          radioJoining = false;
          render();
          resolve();
        } else if(status === "CHANNEL_ERROR" || status === "TIMED_OUT"){
          radioJoining = false;
          toast("Couldn't join the Dispatch radio channel. Reopen Radio PTT to retry.");
          render();
          resolve();
        }
      });
    });
  }).catch(function(e){ radioJoining = false; console.warn("radio join failed", e); });
}

function radioLeaveChannel(){
  Object.keys(radioPeers).forEach(function(cs){ radioClosePeer(cs); });
  if(!radioChannel) return Promise.resolve();
  var ch = radioChannel;
  radioChannel = null;
  radioChannelKey = null;
  return Promise.resolve(ch.unsubscribe()).catch(function(){});
}

/* ---- transcription: browser speech recognition on the talker's own mic ----
Runs only while Talk is held. Uses the Web Speech API (Chrome/Edge on desktop & Android,
Safari on iPhone/iPad/Mac). Chrome sends this audio to Google's speech service to turn it into
text. If the browser has no speech recognition, the transmission is still logged (date, time,
unit) with a note that no transcript was available. */
var RadioSpeech = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var radioTx = null; // {at, finals:[], interim:"", rec, stopped, saved}

function radioStartTranscript(){
  var tx = {at:nowIso(), finals:[], interim:"", rec:null, stopped:false, saved:false, error:""};
  radioTx = tx;
  if(!RadioSpeech) return;
  function startRec(){
    var rec;
    try{ rec = new RadioSpeech(); }catch(e){ tx.error = "unsupported"; return; }
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = function(ev){
      var interim = "";
      for(var i=ev.resultIndex;i<ev.results.length;i++){
        var r = ev.results[i];
        if(r.isFinal) tx.finals.push(r[0].transcript.trim()); else interim += r[0].transcript;
      }
      tx.interim = interim.trim();
    };
    rec.onerror = function(ev){ if(ev && ev.error && ev.error!=="no-speech" && ev.error!=="aborted") tx.error = ev.error; };
    rec.onend = function(){
      // Browsers end recognition on their own after a pause; restart while Talk is still held.
      if(!tx.stopped && radioTx===tx && !tx.error){ startRec(); return; }
      if(tx.stopped) radioSaveTranscript(tx);
    };
    tx.rec = rec;
    try{ rec.start(); }catch(e){ tx.error = "start-failed"; }
  }
  startRec();
}

function radioStopTranscript(){
  var tx = radioTx;
  if(!tx) return;
  tx.stopped = true;
  tx.endedAt = nowIso();
  radioTx = null;
  if(tx.rec){
    // Give the recognizer a moment to deliver the last words, then save from onend.
    setTimeout(function(){ try{ tx.rec.stop(); }catch(e){ radioSaveTranscript(tx); } }, 400);
    setTimeout(function(){ radioSaveTranscript(tx); }, 4000); // safety net if onend never fires
  } else {
    radioSaveTranscript(tx);
  }
}

function radioSaveTranscript(tx){
  if(tx.saved) return;
  tx.saved = true;
  var text = tx.finals.concat(tx.interim ? [tx.interim] : []).join(" ").replace(/\s+/g," ").trim();
  var ms = new Date(tx.endedAt||nowIso()) - new Date(tx.at);
  if(!text){
    if(ms < 1000) return; // accidental tap -- nothing said, don't clutter the log
    text = !RadioSpeech ? "[No transcript — this browser does not support speech-to-text]"
         : (tx.error==="not-allowed" || tx.error==="service-not-allowed") ? "[No transcript — speech-to-text was blocked on this device]"
         : (tx.error==="network") ? "[No transcript — speech-to-text service unreachable]"
         : "[No speech recognized]";
  }
  var u = (typeof currentUnit==="function") ? currentUnit() : null;
  var postId = u && u.post ? u.post : (session.assignedPostId||"");
  var postObj = postId ? STATE.posts.find(function(p){ return p.id===postId; }) : null;
  var t = {
    id: uid("tx"), at: tx.at, endedAt: tx.endedAt||nowIso(), channel: RADIO_CHANNEL_ID,
    callsign: (u && u.callsign) || session.callsign, name: session.name||"",
    post: postId ? (postId+(postObj?" "+postObj.name:"")) : "", text: text
  };
  STATE.radioTranscripts = STATE.radioTranscripts||[];
  STATE.radioTranscripts.unshift(t);
  persist(function(){ return DB.transcripts.insert(t); }, "radio transcript");
}

async function radioStartTalk(){
  if(radioTalking || !radioChannel) return;
  if(!radioLocalStream){
    // Mic was refused when joining. Ask again; if granted, rejoin so every connection carries it.
    var ok = await radioEnsureMic();
    if(!ok){ toast("Microphone access is required to talk on Radio PTT. Allow the mic for this site and try again."); render(); return; }
    await radioLeaveChannel();
    await radioJoinDispatch();
    toast("Mic enabled — press and hold Talk again.");
    return;
  }
  radioLocalStream.getAudioTracks().forEach(function(t){ t.enabled = true; });
  radioTalking = true;
  radioChannel.send({type:"broadcast", event:"talk", payload:{callsign:session.callsign, talking:true}});
  radioStartTranscript();
  render();
}
function radioStopTalk(){
  if(!radioTalking) return;
  if(radioLocalStream) radioLocalStream.getAudioTracks().forEach(function(t){ t.enabled = false; });
  radioTalking = false;
  if(radioChannel) radioChannel.send({type:"broadcast", event:"talk", payload:{callsign:session.callsign, talking:false}});
  radioStopTranscript();
  render();
}

/* Called from app.js when navigating away from the radio route (hashchange) and on sign-out,
so a unit who leaves the tab or signs out never keeps a mic hot or a peer connection open. */
function teardownRadio(){
  radioStopTalk();
  radioLeaveChannel();
  radioJoining = false;
  if(radioLocalStream){
    radioLocalStream.getTracks().forEach(function(t){ t.stop(); });
    radioLocalStream = null;
  }
}

function renderRadio(){
  var joined = radioChannelKey === RADIO_CHANNEL_ID && !!radioChannel;
  var onAir = Object.keys(radioTalkers).filter(function(cs){ return radioTalkers[cs]; });
  var roster = radioPresenceKeys().filter(function(cs){ return cs !== session.callsign; });
  var status = joined ? (roster.length+1)+' on channel' : (radioJoining ? 'joining…' : 'not joined');
  return '<div class="card"><div class="section-head"><h2>Radio PTT</h2><span class="meta">'+status+'</span></div>'+
    '<div style="padding:4px 0 16px;">'+
    '<div class="field"><span class="lbl">Channel</span><div class="v" style="font-weight:700;font-size:16px;">#'+RADIO_CHANNEL_NAME+'</div></div>'+
    (joined
      ? '<div class="small-muted" style="margin:8px 0 4px;">On channel: '+escapeHtml([session.callsign+" (you)"].concat(roster).join(", "))+'</div>'+
        '<div class="small-muted" style="margin:0 0 16px;">On air: '+(onAir.length?'<b style="color:hsl(var(--destructive));">'+escapeHtml(onAir.join(", "))+'</b>':"nobody right now")+'</div>'
      : '<div class="small-muted" style="margin:8px 0 16px;">'+(radioJoining?'Connecting to Dispatch…':'Not connected.')+'</div>')+
    (radioMicDenied ? '<div class="small-muted" style="margin:0 0 10px;color:hsl(var(--destructive));">Microphone is blocked — you can listen, but you need to allow the mic for this site to talk.</div>' : '')+
    '<button id="radioTalkBtn" class="btn primary" style="width:100%;padding:22px;font-size:16px;font-weight:700;user-select:none;-webkit-user-select:none;touch-action:none;'+(radioTalking?'background:hsl(var(--destructive));border-color:hsl(var(--destructive));':'')+'" '+(joined?"":"disabled")+'>'+(radioTalking?"● TALKING — release to stop":"HOLD TO TALK")+'</button>'+
    '<div class="small-muted" style="margin-top:10px;">Live voice on the Dispatch channel. Audio is not recorded, but everything said is transcribed to text and saved to Dispatch Transcripts with the date, time and your unit. Opening this tab asks for microphone access.</div>'+
    (RadioSpeech ? '' : '<div class="small-muted" style="margin-top:6px;color:hsl(var(--destructive));">This browser can\'t do speech-to-text, so your transmissions will be logged without words. Use Chrome, Edge or Safari for transcripts.</div>')+
    '</div></div>';
}

var radioReleaseWired = false;
function wireRadio(){
  if(!radioChannel && !radioJoining && DB && DB.radio) radioJoinDispatch();
  // Safety net: releasing anywhere on the page ends the transmission, even if a re-render
  // swapped the button out from under the unit's finger mid-hold.
  if(!radioReleaseWired){
    radioReleaseWired = true;
    ["mouseup","touchend","touchcancel","blur"].forEach(function(evt){ window.addEventListener(evt, function(){ if(radioTalking) radioStopTalk(); }); });
  }
  var btn = document.getElementById("radioTalkBtn");
  if(!btn) return;
  btn.addEventListener("mousedown", function(e){ e.preventDefault(); radioStartTalk(); });
  btn.addEventListener("touchstart", function(e){ e.preventDefault(); radioStartTalk(); });
  ["mouseup","mouseleave","touchend","touchcancel"].forEach(function(evt){
    btn.addEventListener(evt, function(){ radioStopTalk(); });
  });
}

/* ---------------- TRUCK LOG ---------------- */
function renderTrucks(){
  var onSite = STATE.trucks.filter(function(t){return !t.timeOut && visibleToMe(t.post);});
  var departed = STATE.trucks.filter(function(t){return t.timeOut && visibleToMe(t.post);});
  var view = uiState.truckView||"onsite";
  var list = view==="onsite"?onSite:view==="departed"?departed:STATE.trucks.filter(function(t){return visibleToMe(t.post);});
  var html = '<div class="section-head"><h2>Truck Log — Gate Register</h2><span class="meta">'+onSite.length+' on site · '+STATE.trucks.filter(function(t){return visibleToMe(t.post) && t.timeIn && t.timeIn.slice(0,10)===new Date().toISOString().slice(0,10);}).length+' today</span></div>';
  html += '<div class="two-col">';
  if(session.role!=="CLIENT"){ html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">Gate Check-In</div><form id="truckForm">'+
    '<label class="field"><span class="lbl">Trucking Company <span class="req">*</span></span><input type="text" name="company" required></label>'+
    '<label class="field"><span class="lbl">Driver Name <span class="req">*</span></span><input type="text" name="driver" required></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Trailer # <span class="req">*</span></span><input type="text" name="trailer" required></label>'+
    '<label class="field"><span class="lbl">Tractor #</span><input type="text" name="tractor"></label></div>'+
    (session.role==="CLIENT" ? ('<label class="field"><span class="lbl">Site</span><input type="text" value="'+escapeHtml((function(){var p=STATE.posts.find(function(x){return x.id===mySitePostId();}); return p?(p.id+" \u2014 "+p.name):"No site assigned";})())+'" readonly><input type="hidden" name="post" value="'+escapeHtml(mySitePostId())+'"></label>') : ('<label class="field"><span class="lbl">Post / Site</span><select name="post"><option value="">No post specified</option>'+visiblePosts().map(function(p){return '<option value="'+escapeHtml(p.id)+'" '+(mySitePostId()===p.id?"selected":"")+'>'+escapeHtml(p.id+" \u2014 "+p.name)+'</option>';}).join("")+'</select></label>'))+
    '<label class="field"><span class="lbl">Purpose</span><select name="purpose"><option>Delivery</option><option>Pickup</option><option>Service</option><option>Other</option></select></label>'+
    '<div class="grid2"><label class="field"><span class="lbl">Dock / Door'+(session.role==="CLIENT"?' <span class="req">*</span>':'')+'</span><input type="text" name="dock"'+(session.role==="CLIENT"?' required':'')+'></label><label class="field"><span class="lbl">Seal #'+(session.role==="CLIENT"?' <span class="req">*</span>':'')+'</span><input type="text" name="seal"'+(session.role==="CLIENT"?' required':'')+'></label></div>'+
    '<label class="field"><span class="lbl">BOL / PO #'+(session.role==="CLIENT"?' <span class="req">*</span>':'')+'</span><input type="text" name="bol"'+(session.role==="CLIENT"?' required':'')+'></label>'+
    '<label class="field"><span class="lbl">Driver License / CDL</span><input type="text" name="license"></label>'+
    '<label class="field"><span class="lbl">Notes</span><textarea name="notes" rows="2"></textarea></label>'+
    '<button type="submit" class="btn primary" style="width:100%;">Check in — time in now</button></form></div>'; } else { html += '<div class="card"><div style="font-weight:700;margin-bottom:10px;">Truck Actions</div><div class="small-muted">Trucks are checked in at the gate by security. Use the buttons in the truck list to assign a dock number, log arrival at Shipping/Receiving, and log departure.</div></div>'; }

html += '<div class="card"><div class="tabs">'+["onsite","departed","all"].map(function(v){return '<button class="'+(view===v?"active":"")+'" data-truckview="'+v+'">'+(v==="onsite"?"On site ("+onSite.length+")":v==="departed"?"Departed":"All")+'</button>';}).join("")+'</div>';
  if(!list.length){ html += '<div class="empty-state">No trucks in this view.</div>'; }
  else {
    html += list.map(function(t){
      return '<div class="list-item"><div class="top"><span>'+escapeHtml(t.company)+' / '+escapeHtml(t.driver)+'</span><span class="pill '+(t.timeOut?"muted":"warn")+'">'+(t.timeOut?"DEPARTED":"ON SITE")+'</span></div>'+
        '<div class="meta">Trailer '+escapeHtml(t.trailer)+' · '+escapeHtml(t.post||"—")+' · '+escapeHtml(t.purpose||"")+'</div>'+
        '<div class="meta">Time In '+fmtShort(t.timeIn)+' · Arrived Shipping/Receiving '+(t.dockArrival?fmtShort(t.dockArrival):"—")+' · Departed Shipping/Receiving '+(t.dockDeparture?fmtShort(t.dockDeparture):"—")+' · Time Out '+(t.timeOut?fmtShort(t.timeOut):"—")+'</div>'+
        '<div class="meta">Dock '+escapeHtml(t.dock||"—")+'</div>'+(session.role==="CLIENT" ? (!t.timeOut ? ('<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"><button class="btn sm" data-truck-dock="'+t.id+'">'+(t.dock?"Change dock #":"Assign dock #")+'</button>'+(!t.dockArrival?'<button class="btn sm primary" data-truck-arrive="'+t.id+'">Log arrived — Shipping/Receiving</button>':(!t.dockDeparture?'<button class="btn sm" data-truck-depart="'+t.id+'">Log departed — Shipping/Receiving</button>':'<span class="pill muted">Departed dock</span>'))+'</div>') : '') : (!t.timeOut? '<button class="btn sm" style="margin-top:6px;" data-truck-out="'+t.id+'">Check out</button>' : '<div class="small-muted">On site '+Math.round((new Date(t.timeOut)-new Date(t.timeIn))/60000)+'m</div>'))+
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
             bol:fd.get("bol")||"", license:fd.get("license")||"", notes:fd.get("notes")||"", timeIn:nowIso(), timeOut:null,
             loggedBy:session.callsign, checkedOutBy:""};
    STATE.trucks.unshift(t);
    logActivity("TRUCK", session.callsign, "Truck IN — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+(postId?" @ "+postId:""));
    form.reset(); persist(function(){ return DB.trucks.insert(t); }, "truck "+t.company);
  });
  document.querySelectorAll("[data-truck-out]").forEach(function(b){
    b.addEventListener("click", function(){
      var t = STATE.trucks.find(function(x){return x.id===b.getAttribute("data-truck-out");});
      t.timeOut = nowIso(); t.checkedOutBy = session.callsign;
      var mins = Math.round((new Date(t.timeOut)-new Date(t.timeIn))/60000);
      logActivity("TRUCK", session.callsign, "Truck OUT — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+" — on site "+mins+"m");
      persist(function(){ return DB.trucks.update(t.id, {time_out:t.timeOut, checked_out_by:t.checkedOutBy}); }, "truck "+t.company+" checkout");
    });
  });
  document.querySelectorAll("[data-truck-dock]").forEach(function(b){
    b.addEventListener("click", function(){
      var t = STATE.trucks.find(function(x){return x.id===b.getAttribute("data-truck-dock");});
      if(!t) return;
      var val = prompt("Dock / door number for "+t.company+" ("+t.trailer+")", t.dock||"");
      if(val===null) return;
      val = val.trim();
      var from = t.dock;
      t.dock = val;
      logActivity("TRUCK", session.callsign, "Dock set to "+(val||"none")+" for "+t.company+" / trailer "+t.trailer+(from?" (was "+from+")":""));
      persist(function(){ return DB.trucks.update(t.id, {dock:t.dock}); }, "truck "+t.company+" dock");
    });
  });
  document.querySelectorAll("[data-truck-arrive]").forEach(function(b){
    b.addEventListener("click", function(){
      if(session.role!=="CLIENT") return;
      var t = STATE.trucks.find(function(x){return x.id===b.getAttribute("data-truck-arrive");});
      if(!t || t.dockArrival) return;
      t.dockArrival = nowIso();
      logActivity("TRUCK", session.callsign, "Truck arrived at Shipping/Receiving — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+(t.dock?" @ dock "+t.dock:""));
      persist(function(){ return DB.trucks.update(t.id, {dock_arrival:t.dockArrival}); }, "truck "+t.company+" dock arrival");
    });
  });
  document.querySelectorAll("[data-truck-depart]").forEach(function(b){
    b.addEventListener("click", function(){
      if(session.role!=="CLIENT") return;
      var t = STATE.trucks.find(function(x){return x.id===b.getAttribute("data-truck-depart");});
      if(!t || !t.dockArrival || t.dockDeparture) return;
      t.dockDeparture = nowIso();
      logActivity("TRUCK", session.callsign, "Truck departed Shipping/Receiving — "+t.company+" / driver "+t.driver+" / trailer "+t.trailer+(t.dock?" @ dock "+t.dock:""));
      persist(function(){ return DB.trucks.update(t.id, {dock_departure:t.dockDeparture}); }, "truck "+t.company+" dock departure");
    });
  });
}
