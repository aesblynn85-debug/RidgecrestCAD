-- Ridgecrest CAD — initial data
-- Run after schema.sql on a fresh project. Safe to re-run (uses upserts).
-- Default PIN for every seeded account is 1234 — same as the original
-- migrated system. Guards should change it after first sign-in (Users page).

insert into users (callsign, name, role, title, pin_hash, must_change_pin, active, last_sign_in) values
  ('S-1', 'Bobby Lynn', 'SUPV', 'Security Supervisor', crypt('1234', gen_salt('bf')), true, true, '2026-08-28T14:47:00-04:00'),
  ('ST2-61', 'Anthony', 'GUARD', 'Security Guard', crypt('1234', gen_salt('bf')), true, true, '2026-08-26T04:02:00-04:00')
on conflict (callsign) do nothing;

insert into units (callsign, name, type, status, status_since, post, shift, home_callsign) values
  ('S-61', 'Bobby Lynn', 'Foot Post', 'AVAILABLE', '2026-08-26T06:05:24-04:00', 'STEC-61', 'Shift A', 'S-1'),
  ('ST2-61', 'Anthony Inman', 'Foot Post', 'OFFDUTY', '2026-08-26T04:03:00-04:00', 'STEC-61', 'Shift A', 'ST2-61'),
  ('ST3-61', 'Greg Chapman', 'Foot Post', 'OFFDUTY', '2026-08-24T09:59:17-04:00', 'STEC-61', 'Shift A', ''),
  ('ST4-61', 'Ty', 'Foot Post', 'OFFDUTY', '2026-08-24T09:59:19-04:00', 'STEC-61', 'Shift A', '')
on conflict (callsign) do nothing;

insert into posts (id, name, kind, org, address) values
  ('STEC-61', 'ShieldTec Site', 'Patrol Post', 'ShieldTec', '4961 Golden Parkway, Buford, GA, 30518')
on conflict (id) do nothing;

insert into checkpoints (id, post_id, name, interval_min, last_scan, last_scan_by) values
  ('cp1','STEC-61','Security Checkpoint Tent',120,'2026-08-27T10:47:54-04:00','S-61'),
  ('cp2','STEC-61','Patrol Car',120,'2026-08-27T10:47:59-04:00','S-61'),
  ('cp3','STEC-61','Building 1 Lobby Door',120,null,null),
  ('cp4','STEC-61','Building 1 Rear Doors',120,null,null),
  ('cp5','STEC-61','Building 1 HR Entrance',120,null,null),
  ('cp6','STEC-61','Building 1 Parking Lot',120,null,null),
  ('cp7','STEC-61','Building 2 Office Door',120,null,null),
  ('cp8','STEC-61','Building 2 Driver Entrance',120,'2026-08-27T10:50:08-04:00','S-61'),
  ('cp9','STEC-61','Building 2 Parking Lot',120,'2026-08-27T10:48:10-04:00','S-61'),
  ('cp10','STEC-61','Building 2 rear Doors',120,'2026-08-27T10:50:12-04:00','S-61'),
  ('cp11','STEC-61','Building 4 Lobby Doors',120,null,null),
  ('cp12','STEC-61','Building 4 rear Doors',120,'2026-08-27T10:50:24-04:00','S-61'),
  ('cp13','STEC-61','Building 4 Driver Entrance',120,'2026-08-27T10:50:24-04:00','S-61'),
  ('cp14','STEC-61','Building 4 Braekroom Entrance',120,null,null),
  ('cp15','STEC-61','Building 4 Parking Lot',120,'2026-08-27T10:48:19-04:00','S-61')
on conflict (id) do nothing;

insert into chat_channels (id, name, description) values
  ('all-hands','All Hands','Site-wide traffic — every guard on shift reads this.'),
  ('shieldtec','ShieldTec',''),
  ('guard','Guard',''),
  ('supervisor','Supervisor',''),
  ('admin','Admin',''),
  ('dispatch','Dispatch','')
on conflict (id) do nothing;

insert into chat_messages (channel_id, from_callsign, name, bolo, text, at) values
  ('all-hands','S-61','Bobby Lynn',true,'Employee Vehicles continue to use BLDG 1 Exit only as an enterance','2026-08-24T05:07:40-04:00'),
  ('all-hands','DISPATCH-1','',false,'S-61 going on patrol','2026-08-24T05:49:43-04:00'),
  ('all-hands','S-61','Bobby Lynn',false,'S-61 nack at security tent','2026-08-24T05:55:23-04:00'),
  ('all-hands','DISPATCH-1','',false,'Copy Back at checkpoint','2026-08-24T05:56:24-04:00'),
  ('all-hands','ST2-61','Anthony Ian',true,'2007 Lexus LS GA Plate # SKN8660. Multiple violations of the Exit Only. Active Safety Concern.','2026-08-24T07:42:17-04:00'),
  ('shieldtec','S-1','',false,'ShieldTec Guards Trucks are not allowed to sleep on property overnight if a driver is out of hours they may use the old BTD truck lot to rest and regain hours or the gravle lot beside the Shell gas station on the other side of Lanier Islands Parkway.','2026-08-25T11:31:23-04:00');

insert into reports (id, type, type_label, status, attach_to_call, post, occurred, location, subject, narrative,
  involved_parties, witnesses, property_damage, est_loss, action_taken, notify_injury, notify_ems, notify_police,
  who_else_notified, force_used, written_by, written_by_callsign, submitted_at, reviewed_at, reviewed_by, supervisor_notes) values
  ('RTA-20260828-001','vehicle','Vehicle / Traffic','APPROVED','Standalone','STEC-61 ShieldTec Site','2026-08-28T03:40:00-04:00',
   'Sidewalk Building 2 and Building 2 employee entrance area','Undafe Vehicle Operations',
   'At approximately 3:40AM Myself and Guard Anthony Inman were conducting security shift change and pass down. we witnessed an employee who had parked their motorcycle under the overhang at Building 2, near an employee entrance door. This employee then got on the motorcycle and was going to head home. the employee then proceeded to leave by driving from the employee entrance door on the sidewalk in front of building 2 all the way down the sidewalk to far end of building 2 and get off the sidewalk at the very last 2 handicap parking spaces ramp. exit the parking lot via the las parking lot easement and fly out past the security checkpoint tent. no way to get an accurate speed of the motorcycle while it traveled down the sidewalk of building 2 but a guesstimate of approximately 25MPH judging by the time it took to get from one pillar of the overhang to the next.',
   'Unknown', E'Security Guard Anthony Inman\nAnd myself', '', '', 'Documented and reported to HR', false, false, false,
   '', false, 'Bobby Lynn', 'S-1', '2026-08-28T06:35:00-04:00', '2026-08-28T09:45:00-04:00', 'S-1',
   'Vehicle Descrption has been obtained Yamaha YZF-R6 GA PLate out of Barrow County YZFR06'),
  ('RTA-20260825-001','other','Other','APPROVED','Standalone','','2026-08-25T08:22:00-04:00',
   'Security Checkpoint','Joggers','Jogger jogging up to just in front of security tent turning around and jogging back off property',
   E'Jogger wearing grey gym shorts white tank top and running shoes white male 5\'9" approximately mid 20\'s black/ brown hair',
   'Me; Site Security Supervisor', 'N/A', '', 'None- Left property before reaching secured areas', false, false, false,
   '', false, 'Bobby Lynn', 'S-1', '2026-08-25T08:39:00-04:00', '2026-08-25T08:41:00-04:00', 'S-1',
   'Good spot, appears to be a routine for the weekdays same jogger spotted multiple times in the past keep a log')
on conflict (id) do nothing;

insert into counters (key, value) values ('call', 0), ('report', 2), ('parking', 0)
  on conflict (key) do update set value = excluded.value;

insert into activity_log (at, type, actor, text) values
  ('2026-08-28T14:47:00-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-28T14:41:25-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-28T14:00:55-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-28T13:04:45-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-28T09:45:48-04:00','REPORT','S-1','REPORT APPROVED RTA-20260828-001 by S-1 — Vehicle Descrption has been obtained Yamaha YZF-R6 GA PLate out of Barrow County YZFR06'),
  ('2026-08-28T06:48:21-04:00','REPORT','S-1','REPORT APPROVED RTA-20260828-001 by S-1'),
  ('2026-08-28T06:38:37-04:00','REPORT','S-1','Report RTA-20260828-001 edited'),
  ('2026-08-28T06:37:10-04:00','REPORT','S-1','REPORT RETURNED RTA-20260828-001 by S-1 — An not And'),
  ('2026-08-28T06:36:11-04:00','REPORT','S-1','REPORT APPROVED RTA-20260828-001 by S-1'),
  ('2026-08-28T06:35:41-04:00','REPORT','S-1','REPORT SUBMITTED RTA-20260828-001 — vehicle: Undafe Vehicle Operations'),
  ('2026-08-28T06:22:36-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-27T10:50:24-04:00','CHECKPOINT','S-61','Tour scan — Building 4 rear Doors at STEC-61 by S-61'),
  ('2026-08-27T10:50:24-04:00','CHECKPOINT','S-61','Tour scan — Building 4 Driver Entrance at STEC-61 by S-61'),
  ('2026-08-27T10:50:12-04:00','CHECKPOINT','S-61','Tour scan — Building 2 rear Doors at STEC-61 by S-61'),
  ('2026-08-27T10:50:08-04:00','CHECKPOINT','S-61','Tour scan — Building 2 Driver Entrance at STEC-61 by S-61'),
  ('2026-08-27T10:48:19-04:00','CHECKPOINT','S-61','Tour scan — Building 4 Parking Lot at STEC-61 by S-61'),
  ('2026-08-27T10:48:10-04:00','CHECKPOINT','S-61','Tour scan — Building 2 Parking Lot at STEC-61 by S-61'),
  ('2026-08-27T10:47:59-04:00','CHECKPOINT','S-61','Tour scan — Patrol Car at STEC-61 by S-61'),
  ('2026-08-27T10:47:54-04:00','CHECKPOINT','S-61','Tour scan — Security Checkpoint Tent at STEC-61 by S-61'),
  ('2026-08-27T10:28:16-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-27T10:10:24-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-27T08:10:08-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-26T11:20:23-04:00','TRUCK','S-1','Truck OUT — FedEx / driver FedEx Semi / trailer X11839 — on site 24m'),
  ('2026-08-26T10:56:36-04:00','TRUCK','S-1','Truck IN — FedEx / driver FedEx Semi / trailer X11839 @ STEC-61'),
  ('2026-08-26T10:55:25-04:00','TRUCK','S-1','Truck OUT — Carter / driver James / trailer 513339 — on site 48m'),
  ('2026-08-26T10:55:15-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-26T10:24:54-04:00','TRUCK','S-1','Truck OUT — Carter / driver Brandon / trailer 512936 — on site 66m'),
  ('2026-08-26T10:07:25-04:00','TRUCK','S-1','Truck IN — Carter / driver James / trailer 513339 @ STEC-61'),
  ('2026-08-26T09:26:43-04:00','INCIDENT','S-1','20260826-0002 status ONSCENE → CLEARED'),
  ('2026-08-26T09:20:45-04:00','INCIDENT','S-1','CALL CREATED 20260826-0002 — P4 10-08L Patrol Tour @ STEC-61 ShieldTec Site'),
  ('2026-08-26T08:49:08-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-26T07:12:22-04:00','INCIDENT','S-1','20260826-0001 status ONSCENE → CLEARED'),
  ('2026-08-26T06:37:20-04:00','TRUCK','S-1','Truck OUT — Ceva / driver Bob / trailer 285541 — on site 13m'),
  ('2026-08-26T06:24:23-04:00','TRUCK','S-1','Truck IN — Ceva / driver Bob / trailer 285541 @ STEC-61'),
  ('2026-08-26T06:23:56-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-26T06:08:35-04:00','INCIDENT','S-1','CALL CREATED 20260826-0001 — P4 10-41 Monitoring Exit Only @ STEC-61 ShieldTec Site'),
  ('2026-08-26T06:05:24-04:00','UNIT','DISPATCH','Unit S-61 status OFFDUTY → AVAILABLE'),
  ('2026-08-26T06:05:13-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-26T04:03:06-04:00','AUTH','Anthony','Anthony signed out'),
  ('2026-08-26T04:02:03-04:00','AUTH','ST2-61','Anthony (ST2-61) signed in'),
  ('2026-08-26T03:58:35-04:00','AUTH','ST2-61','Anthony changed their PIN'),
  ('2026-08-26T03:57:59-04:00','AUTH','ST2-61','Anthony (ST2-61) signed in'),
  ('2026-08-26T02:32:25-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-25T18:06:14-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-25T16:31:44-04:00','AUTH','S-1','Bobby Lynn created guard account ST2-61 (Anthony)'),
  ('2026-08-25T14:29:47-04:00','UNIT','DISPATCH','Unit S-61 status AVAILABLE → OFFDUTY'),
  ('2026-08-25T12:59:11-04:00','TRUCK','S-1','Truck OUT — MK Courier / driver Tina / trailer 1 — on site 93m'),
  ('2026-08-25T12:59:09-04:00','TRUCK','S-1','Truck OUT — Universal / driver Michael / trailer 387156 — on site 87m'),
  ('2026-08-25T11:57:11-04:00','INCIDENT','S-1','20260825-0004 status ONSCENE → CLEARED'),
  ('2026-08-25T11:15:48-04:00','INCIDENT','S-1','Narrative supplement on 20260825-0004: Finished last Patrol and back at Security Checkpoint awaiting Shift Change'),
  ('2026-08-25T11:09:20-04:00','INCIDENT','S-1','CALL CREATED 20260825-0004 — P4 10-19 Shift Change @ STEC-61 ShieldTec Site'),
  ('2026-08-25T10:32:21-04:00','SYSTEM','DISPATCH','Post STEC-61 — ShieldTec Site added to site directory'),
  ('2026-08-25T09:10:37-04:00','AUTH','Bobby Lynn','Bobby Lynn signed out'),
  ('2026-08-25T08:41:10-04:00','REPORT','S-1','REPORT APPROVED RTA-20260825-001 by S-1'),
  ('2026-08-25T08:40:57-04:00','REPORT','S-1','REPORT APPROVED RTA-20260825-001 by S-1 — Good spot, appears to be a routine for the weekdays same jogger spotted multiple times in the past keep a log'),
  ('2026-08-25T08:39:17-04:00','REPORT','S-1','REPORT SUBMITTED RTA-20260825-001 — other: Joggers'),
  ('2026-08-25T07:50:41-04:00','INCIDENT','S-1','20260825-0003 status ONSCENE → CLEARED'),
  ('2026-08-25T07:45:29-04:00','INCIDENT','S-1','CALL CREATED 20260825-0003 — P4 10-08L Patrol Tour @ STEC-7170 Ridgecrest Operations Security Checkpoint'),
  ('2026-08-25T07:42:44-04:00','AUTH','S-1','Failed sign-in for S-1'),
  ('2026-08-25T07:21:53-04:00','AUTH','S-1','Bobby Lynn (S-1) signed in'),
  ('2026-08-25T07:06:36-04:00','AUTH','S-1','Bobby Lynn changed their PIN'),
  ('2026-08-25T06:59:58-04:00','AUTH','SYSTEM','Supervisor account created for Bobby Lynn (S-1) — first-run PIN must be changed at sign-in'),
  ('2026-08-24T07:42:17-04:00','CHAT','ST2-61','BOLO on All Hands — 2007 Lexus LS GA Plate # SKN8660. Multiple violations of the Exit Only. Active Safety Concern.'),
  ('2026-08-24T07:25:38-04:00','SYSTEM','DISPATCH','Post STEC-7170 — Ridgecrest Operations Security Checkpoint added to site directory'),
  ('2026-08-24T07:16:59-04:00','UNIT','DISPATCH','Unit ST3-61 (Greg Chapman) added to roster'),
  ('2026-08-24T07:16:23-04:00','UNIT','DISPATCH','Unit ST2-61 (Anthony Ian) added to roster'),
  ('2026-08-24T05:07:40-04:00','CHAT','S-61','BOLO on All Hands — Employee Vehicles continue to use BLDG 1 Exit only as an enterance'),
  ('2026-08-24T05:04:10-04:00','INCIDENT','S-61','CALL CREATED 20260824-0007 — P2 10-41 Access Control Issue @ RTA-05 Ridgecrest Operations — Perimeter Patrol Route'),
  ('2026-08-24T04:33:51-04:00','UNIT','DISPATCH','Unit S-61 (Bobby Lynn) added to roster'),
  ('2026-08-24T04:30:42-04:00','SYSTEM','DISPATCH','Ridgecrest CAD console initialized — seed roster and post directory loaded');
