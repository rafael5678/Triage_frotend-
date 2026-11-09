/** catalog: staff UI module. User-facing copy stays in Spanish. */
import { TRIAGE_BANDS, esiFloorFromSeverity } from "./triageBands";

let liveSymptoms = [];

export function setSymptomCatalog(rows) {
  liveSymptoms = Array.isArray(rows) ? rows : [];
}

export function symptomCatalog() {
  return liveSymptoms;
}

export function findSymptom(id) {
  if (!id) return null;
  return liveSymptoms.find((c) => c.id === id) || null;
}

export function conditionLabel(id) {
  return findSymptom(id)?.label || "Motivo no indicado";
}

const EMERGENCY_MOTIFS = new Set(["paro", "avc", "sca", "trauma", "disnea", "sepsis", "anafilaxia", "hemorragia", "convulsion"]);

function measuredCrisis(row) {
  if (!row) return false;
  const estimated = new Set(row.estimatedFields || []);
  const spo2 = Math.min(100, Number(row.spo2));
  const hr = Number(row.heartRate ?? row.fc);
  const sbp = Number(row.systolic ?? row.pas);
  const temp = Number(row.temperature ?? row.temp);
  const avpu = String(row.consciousness || "").toUpperCase().charAt(0);
  if (!estimated.has("spo2") && Number.isFinite(spo2) && spo2 < 95) return true;
  if (!estimated.has("heartRate") && hr > 0 && (hr < 50 || hr > 130)) return true;
  if (!estimated.has("systolic") && sbp > 0 && (sbp < 90 || sbp >= 180)) return true;
  if (!estimated.has("temperature") && Number.isFinite(temp) && (temp <= 35.5 || temp >= 39)) return true;
  return avpu === "P" || avpu === "U" || avpu === "V";
}

/** ESI floor from catalog gravity. A finger with stable vitals does not stick at ESI I. */
export function catalogEsiFloor(severity, row) {
  const floor = esiFloorFromSeverity(severity);
  if (row == null) return floor;
  const id = row.conditionId || row.lesionId;
  if (EMERGENCY_MOTIFS.has(id) || measuredCrisis(row)) return floor;
  return TRIAGE_BANDS.MIN;
}
