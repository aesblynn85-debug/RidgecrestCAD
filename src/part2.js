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
