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
    submitted_at:r.submittedAt, reviewed_at:r.reviewedAt, reviewed_by:r.reviewedBy, supervisor_notes:r˜�\\��\�ܓ��\���NB��[��[ۈ����T����^�]\���Y���Y�\N����\_���[����[�Y���\ܝY����\ܝ�Y��������������\��Y������\��Y���][ے[�������][ۗ�[�����]N���]_��]T�]N���]W��]_���ZX�Q\�Μ���ZX�W�\������]�\�����]�\����\��]]�N����\��]]�_��X�[ەZ�[����X�[ۗ�Z�[������Y�X�][ۜΞ��X�N�H\����Y�W��X�K��Y�]�H\����Y�W����Y�]�ΈH\����Y�W���K���[�S��Y�YY������[�Wۛ�Y�YY���]\Μ���]\�ܚ][��N���ܚ][�؞_���ܚ][��P�[�Yێ���ܚ][�؞W��[�Y۟���X�Z]Y]����X�Z]Y�]�]�Y]�Y]����]�Y]�Y�]��]�Y]�Y�N����]�Y]�Y؞K�\\��\�ܓ��\Μ��7WW'f�6�%���FW7��"'Ӱ�ЦgV�7F���eF�&�r�b���&WGW&���C�b�B�gG�S�b�gG�W��""�6����C�b�6�����V���&W�'E��C�b�&W�'D�G���V����7C�b��7G��""��67W'&VC�b��67W'&VB����6F���������C�b���6F������G��""��FS�b��FW��""��FU�7FFS�b��FU7FFW��""�fV��6�U�FW63�b�fV��6�TFW67��""��G&�fW#�b�G&�fW'��""��'&F�fS�b��'&F�fW��""�7F����F�V�b�7F���F�V���""����F�g���Ɩ6S��b���F�f�6F���2bgb���F�f�6F���2��Ɩ6R����F�g��&���v�C��b���F�f�6F���2bgb���F�f�6F���2�&��v�B�����F�g��F�s��b���F�f�6F���2bgb���F�f�6F���2�F�r��v���V�6U���F�f�VC�b�v��V�6T��F�f�VG��""�7FGW3�b�7FGW2��w&�GFV��'��b�w&�GFV�'���""�w&�GFV��'��6��6�v�b�w&�GFV�'�6��6�v���""�7V&֗GFVE�C�b�7V&֗GFVDB��&Wf�WvVE�C�b�&Wf�WvVDB�&Wf�WvVE�'��b�&Wf�WvVD'��7WW'f�6�%���FW3�b�7WW'f�6�$��FW7��"'Ӱ�ЦgV�7F���7F�f�G�g&��&�r�"��&WGW&��C�"�B�G�S�"�G�R�7F�#�"�7F�"�FW�C�"�FW�GӲР��������������BWfW'�F���r��F�F�R5DDR6�RF�RT�W�V7G2������������7��2gV�7F�����D��7FFR�����W7B����f"&W7V�G2�v�B&�֗6R����6"�g&�҂'W6W'5�V&Ɩ2"��6V�V7B�"�"���6"�g&�҂'V�G2"��6V�V7B�"�"���6"�g&�҂'�7G2"��6V�V7B�"�"���6"�g&�҂&6�V6����G2"��6V�V7B�"�"���6"�g&�҂&6��2"��6V�V7B�"�"���&FW"�&7&VFVE�B"Ƕ66V�F��s�f�6WҒ��6"�g&�҂&6���7W�V�V�G2"��6V�V7B�"�"���&FW"�&B"Ƕ66V�F��s�G'VWҒ��6"�g&�҂&6�E�6���V�2"��6V�V7B�"�"���6"�g&�҂&6�E��W76vW2"��6V�V7B�"�"���&FW"�&B"Ƕ66V�F��s�G'VWҒ��6"�g&�҂'G'V6�2"��6V�V7B�"�"���&FW"�'F��U���"Ƕ66V�F��s�f�6WҒ��6"�g&�҂'&W�'G2"��6V�V7B�"�"���6"�g&�҂'&���u�f���F���2"��6V�V7B�"�"���6"�g&�҂'�Ɩ6U����&�W'G�"��6V�V7B�"�"���6"�g&�҂&7F�f�G����r"��6V�V7B�"�"���&FW"�&B"Ƕ66V�F��s�f�6WҒ�Ɩ֗B�S���6"�g&�҂&6�V�FW'2"��6V�V7B�"�"��ғ��&W7V�G2�f�$V6��6�����f"W6W'2�&W7V�G5���FF�V�G2�&W7V�G5���FF��7G2�&W7V�G5�%��FF�6�V6����G2�&W7V�G5�5��FF��6��2�&W7V�G5�E��FF�7W�V�V�G2�&W7V�G5�U��FF�6���V�2�&W7V�G5�e��FF��W76vW2�&W7V�G5�u��FF��G'V6�2�&W7V�G5����FF�&W�'G2�&W7V�G5����FF�g2�&W7V�G5���FF��Ɩ6R�&W7V�G5���FF��7F�f�G��&W7V�G5�%��FF�6�V�FW'2�&W7V�G5�5��FF���f"6��4�WB�6��2���6��g&��&�r���7W�V�V�G2�f�$V6��gV�7F���2���f"2�6��4�WB�f��B�gV�7F��⇂��&WGW&���C���2�6����C�ғ���b�2�2��'&F�fU7W�V�V�G2�W6���C�2�B�'��2�'��FW�C�2�FW�Gғ��ғ��f"�7G4�WB��7G2���gV�7F������&WGW&���C��B���S����R����C�涖�G��""��&s���&w��""�FG&W73��FG&W77��""��6�V6����G3�6�V6����G2�f��FW"�gV�7F���2��&WGW&�2��7E��C����C�Ғ���gV�7F���2���&WGW&���C�2�B���S�2���R���FW'f�֖�2��FW'f��֖���7E66�2��7E�66���7E66�'��2��7E�66��'�Ӱ�җӰ�ғ��f"6�V�FW$���Ӳ6�V�FW'2�f�$V6��gV�7F���2��6�V�FW$��2�W���2�f�VS�ғ���&WGW&����WF��6�FS�%&�FvV7&W7BF�&VBGf�6�'�"�7&VFVDC��V�����W6W'3�W6W'2���gV�7F���R��&WGW&��6��6�v�R�6��6�v����S�R���R�&��S�R�&��R�F�F�S�R�F�F�W��""��7F�fS�R�7F�fR��7E6�v��R��7E�6�v������W7D6��vU��R��W7E�6��vU���ӲҒ��V�G3�V�G2���V�Dg&��&�r����7G3��7G4�WB��6��3�6��4�WB��6��6W�6�V�FW$��6������6�C��6���V�3�6���V�2���gV�7F���2��&WGW&���C�2�B���S�2���R�FW63�2�FW67&�F�����"'ӷҒ��W76vW3��W76vW2���gV�7F���җ��&WGW&��6���Væ��6���V���B�g&�Ӧ��g&���6��6�v���""���S�����W��""�&�����&����FW�C���FW�B�C���GӰ�җ���G'V6�3�G'V6�2���G'V6�g&��&�r���&W�'E6W�6�V�FW$��&W�'G����&W�'G3�&W�'G2���&W�'Dg&��&�r����Ɩ6T��&�W'G���Ɩ6R���gV�7F�����&WGW&���C��B�'&�fVDC��'&�fVE�B�FW'FVDC��FW'FVE�B��vV�7���vV�7���""��ff�6W#���ff�6W'��""�&V6���&V6����""���FW3����FW7��"'ӷҒ��&���u6W�6�V�FW$��&���w����&���uf���F���3�g2���dg&��&�r���7F�f�G���s�7F�f�G����7F�f�G�g&��&�r��Ӱ�Р������������WF����2&R�6�VB6W'fW"�6�FS�F�R6ƖV�B�WfW"6VW2����6��������������7��2gV�7F���fW&�g���6��6�v���◲�W7B���&WGW&�6���v�B6"�'2�'fW&�g����"���6��6�v�6��6�v�������Ғ��Ц7��2gV�7F���6WE��6��6�v���Wu����W7B���6���v�B6"�'2�'6WE���"���6��6�v�6��6�v����Wu����Wu��Ғ��Ц7��2gV�7F���7&VFTwV&B�6��6�v����R��◲�W7B���6���v�B6"�'2�&7&VFU�wV&B"���6��6�v�6��6�v�����S���R��������##3B'Ғ��Ц7��2gV�7F���&W6WE��6��6�v◲�W7B���6���v�B6"�'2�'&W6WE���"���6��6�v�6��6�v�Ғ��Ц7��2gV�7F���&V6�&E6�v��6��6�v◲�W7B���6���v�B6"�'2�'&V6�&E�6�v����"���6��6�v�6��6�v�Ғ��Ц7��2gV�7F����W�D6�V�FW"��W����W7B���&WGW&�6���v�B6"�'2�&�W�E�6�V�FW""��6�V�FW%��W���W�Ғ��Ц7��2gV�7F���6WEW6W$7F�fR�6��6�v��7F�fR���W7B���6���v�B6"�g&�҂'W6W'2"��WFFR��7F�fS�7F�fWҒ�W�&6��6�v�"�6��6�v⒓�Р������������vV�W&�2&�rw&�FW'2������������7��2gV�7F�����6W'E&�r�F&�R�&�r���W7B���6���v�B6"�g&�҇F&�R���6W'B�&�r���Ц7��2gV�7F���WFFU&�r�F&�R��D6����Ef��F6����W7B���6���v�B6"�g&�҇F&�R��WFFR�F6���W��D6����Ef��Ц7��2gV�7F���FV�WFU&�r�F&�R��D6����Ef��W7B���6���v�B6"�g&�҇F&�R��FV�WFR���W��D6����Ef��Ц7��2gV�7F���W6W'E&�r�F&�R�&�r���W7B���6���v�B6"�g&�҇F&�R��W6W'B�&�r���Р������������W"�V�F�G�w&�FR�V�W'2W6VB'��2�'C"�2�'C2�2������������f"D"���6��f�wW&VC�4��d�uU$TB����D��7FFS���D��7FFR��WF���fW&�g���fW&�g����6WE��6WE���7&VFTwV&C�7&VFTwV&B�&W6WE��&W6WE���&V6�&E6�v��&V6�&E6�v���6WEW6W$7F�fS�6WEW6W$7F�fW���6�V�FW'3���W�C��W�D6�V�FW'���6��3�����6W'C�gV�7F���2��&WGW&���6W'E&�r�&6��2"�6��F�&�r�2������WFFS�gV�7F��↖B�F6���&WGW&�WFFU&�r�&6��2"�&�B"ƖB�F6������FE7W�V�V�C�gV�7F���6�ĖB�7W��&WGW&���6W'E&�r�&6���7W�V�V�G2"��6����C�6�ĖB�C�7W�B�'��7W�'��FW�C�7W�FW�Gғ�Т���V�G3�����6W'C�gV�7F���R��&WGW&���6W'E&�r�'V�G2"�V�EF�&�r�R������WFFS�gV�7F���6��6�v��F6���&WGW&�WFFU&�r�'V�G2"�&6��6�v�"�6��6�v��F6������&V��fS�gV�7F���6��6�v◲&WGW&�FV�WFU&�r�'V�G2"�&6��6�v�"�6��6�v⓲Т���6�V6����G3���66�gV�7F���7�B�'���&WGW&�WFFU&�r�&6�V6����G2"�&�B"�7�BǶ�7E�66��WrFFR���F��4�7G&��r����7E�66��'��'�ғ�Т���6�C���FD6���VâgV�7F���6���&WGW&���6W'E&�r�&6�E�6���V�2"���C�6��B���S�6����R�FW67&�F���6��FW67��"'ғ����FD�W76vS�gV�7F���җ�&WGW&���6W'E&�r�&6�E��W76vW2"��6���V���C���6���V��g&���6��6�v���g&����""���S�����W��""�&�����&����FW�C���FW�B�C���Gғ�Т���G'V6�3�����6W'C�gV�7F���B��&WGW&���6W'E&�r�'G'V6�2"�G'V6�F�&�r�B������6�V6��WC�gV�7F��↖B�F��T�WB��&WGW&�WFFU&�r�'G'V6�2"�&�B"ƖBǷF��U��WC�F��T�WGғ�Т���&W�'G3�����6W'C�gV�7F���"��&WGW&���6W'E&�r�'&W�'G2"�&W�'EF�&�r�"������WFFS�gV�7F��↖B�F6���&WGW&�WFFU&�r�'&W�'G2"�&�B"ƖB�F6���Т���&���s�����6W'C�gV�7F���b��&WGW&���6W'E&�r�'&���u�f���F���2"�eF�&�r�b������WFFS�gV�7F��↖B�F6���&WGW&�WFFU&�r�'&���u�f���F���2"�&�B"ƖB�F6���Т���7F�f�G������6W'C�gV�7F���V�G'���&WGW&���6W'E&�r�&7F�f�G����r"��C�V�G'��B�G�S�V�G'��G�R�7F�#�V�G'��7F�"�FW�C�V�G'��FW�Gғ�Т����7V'67&�&RF�ƗfR6��vW2g&���F�W"wV&G2r6W76���2���6��vR�26��VBv�F�F�P�F&�R��Rv�V�WfW"&�r6��vW3�6��W'2G��6�ǒ&VfWF6�F�B6Ɩ6R�B&R�&V�FW"���7V'67&�&U&V�F��S�gV�7F�����6��vR����b�6"�&WGW&��V�ð�f"F&�W2��'V�G2"�&6��2"�&6���7W�V�V�G2"�&6�E��W76vW2"�'G'V6�2"�'&W�'G2"�'&���u�f���F���2"�&6�V6����G2"�&7F�f�G����r%Ӱ�f"6���V��6"�6���V&6B�ƗfR"���F&�W2�f�$V6��gV�7F���B���6���V����'�7Fw&W5�6��vW2"��WfV�C�"�"�66�V��'V&Ɩ2"�F&�S�G��gV�7F������B����6��vR�B����B��ғ��ғ��6���V��7V'67&�&R����&WGW&�6���Vð�ЧӰ��v��F�r���4E�D"�D#��Ғ���
