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

/** Piso ESI: 78 crítica, 62 alta, 42 media. Un dedo con signos estables no se pega a crítica. */
export function catalogEsiFloor(severity, row) {
  const n = Number(severity);
  if (!Number.isFinite(n)) return 0;
  let floor = 0;
  if (n >= 78) floor = 78;
  else if (n >= 62) floor = 62;
  else if (n >= 42) floor = 42;
  if (row == null) return floor;
  const id = row.conditionId || row.lesionId;
  if (EMERGENCY_MOTIFS.has(id) || measuredCrisis(row)) return floor;
  return 0;
}
