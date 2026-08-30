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
    '<button class="'+(tab==="police"?"active":"")+'" data-reptab="police">Police On Property '+STATE.policeOnProperty.length+' now</button>'+
    '<button class="'+(tab==="self"?"active":"")+'" data-reptab="self">Self-Initiated Call</button>'+
  '</div>';
  if(tab!=="incident"){
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
    '<div class="small-muted" style="margin-bottom:14px;">Every account signs in with a callsign and a PIN. Guards can read the board and report — post to Patrol Chat, scan checkpoints, log trucks and attach photos. Supervisors add the roster, post directory, these accounts and the data reset.</div>';
  html += STATE.users.map(function(u){
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid hsl(var(--border)/.6);">'+
      '<div><div style="font-weight:700;">'+escapeHtml(u.callsign)+' <span class="pill blue">'+u.role+'</span>'+(u.callsign===session.callsign?' <span class="pill ok">YOU</span>':'')+'</div>'+
      '<div class="small-muted">'+escapeHtml(u.name)+' — '+escapeHtml(u.title)+'</div>'+
      '<div class="small-muted">Last sign-in: '+(u.lastSignIn?fmtShort(u.lastSignIn):"never")+'</div></div>'+
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
}
