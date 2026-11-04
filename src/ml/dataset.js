import { catalogEsiFloor, findSymptom } from "../models/catalog";
import { COMORBIDITIES, CONDITIONS } from "./conditions";

export { COMORBIDITIES, CONDITIONS };

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(random, arr) {
  return arr[Math.floor(random() * arr.length)];
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function news2Score(v) {
  const rr = Number(v.respiratoryRate ?? v.fr);
  const spo2 = Number(v.spo2);
  const temp = Number(v.temperature ?? v.temp);
  const sbp = Number(v.systolic ?? v.pas);
  const hr = Number(v.heartRate ?? v.fc);
  let s = 0;
  if (rr <= 8) s += 3;
  else if (rr <= 11) s += 1;
  else if (rr <= 20) s += 0;
  else if (rr <= 24) s += 2;
  else s += 3;
  if (spo2 <= 91) s += 3;
  else if (spo2 <= 93) s += 2;
  else if (spo2 <= 95) s += 1;
  if (temp <= 35) s += 3;
  else if (temp <= 36) s += 1;
  else if (temp <= 38) s += 0;
  else if (temp <= 39) s += 1;
  else s += 2;
  if (sbp <= 90) s += 3;
  else if (sbp <= 100) s += 2;
  else if (sbp <= 110) s += 1;
  else if (sbp >= 220) s += 3;
  if (hr <= 40) s += 3;
  else if (hr <= 50) s += 1;
  else if (hr <= 90) s += 0;
  else if (hr <= 110) s += 1;
  else if (hr <= 130) s += 2;
  else s += 3;
  return s;
}

export const news2 = news2Score;

export function clinicalLabel(row) {
  const n = news2Score(row);
  const hr = Number(row.heartRate ?? row.fc);
  const sbp = Number(row.systolic ?? row.pas);
  const shock = hr / Math.max(40, sbp);
  const age = Number(row.age ?? row.edad);
  const condition = findSymptom(row.conditionId || row.lesionId)
    || CONDITIONS.find((c) => c.id === row.conditionId || c.id === row.lesionId)
    || CONDITIONS[9];
  const comorb = (row.comorbidityIds || row.comorbIds || []).reduce((sum, id) => {
    const item = COMORBIDITIES.find((c) => c.id === id);
    return sum + (item ? item.weight : 0);
  }, 0);
  let y = condition.severity * 0.38 + (n / 20) * 100 * 0.42 + Math.min(25, (shock - 0.5) * 40) + Math.min(12, age / 10) * 0.35 + comorb * 0.55;
  if (Number(row.spo2) < 85 || sbp < 80 || Number(row.respiratoryRate ?? row.fr) < 8) y = Math.max(y, 88);
  y = Math.max(y, catalogEsiFloor(condition.severity));
  return clamp(Math.round(y * 10) / 10, 0, 100);
}

export function generateDataset(n = 140) {
  const random = rng(20261001);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const condition = pick(random, CONDITIONS);
    const severe = condition.severity > 70;
    const age = Math.floor(2 + random() * 90);
    const comorbidityIds = COMORBIDITIES.filter(() => random() < (age > 60 ? 0.28 : 0.12)).map((c) => c.id);
    const row = {
      id: `T-${String(i + 1).padStart(3, "0")}`,
      age,
      sex: random() > 0.5 ? "M" : "F",
      heartRate: clamp(Math.round(severe ? 70 + random() * 90 : 58 + random() * 50), 35, 190),
      spo2: clamp(Math.round(severe ? 82 + random() * 16 : 94 + random() * 6), 70, 100),
      systolic: clamp(Math.round(severe ? 75 + random() * 70 : 108 + random() * 40), 60, 220),
      temperature: clamp(Math.round((severe ? 36 + random() * 4.2 : 36.2 + random() * 1.6) * 10) / 10, 34, 41.5),
      respiratoryRate: clamp(Math.round(severe ? 12 + random() * 28 : 12 + random() * 10), 6, 44),
      conditionId: condition.id,
      comorbidityIds,
    };
    row.diastolic = clamp(Math.round(row.systolic * (0.55 + random() * 0.12)), 35, 130);
    row.y = clamp(clinicalLabel(row) + (random() - 0.5) * 8, 0, 100);
    rows.push(row);
  }
  return rows;
}

export const FEATURES = ["age", "heartRate", "spo2", "systolic", "diastolic", "temperature", "respiratoryRate", "news", "shock", "comorbidity", "condition"];

export function toFeatures(row) {
  const condition = findSymptom(row.conditionId || row.lesionId)
    || CONDITIONS.find((c) => c.id === (row.conditionId || row.lesionId));
  const comorbidity = (row.comorbidityIds || row.comorbIds || []).reduce((sum, id) => sum + (COMORBIDITIES.find((c) => c.id === id)?.weight || 0), 0);
  const systolic = Number(row.systolic ?? row.pas) || 120;
  const heartRate = Number(row.heartRate ?? row.fc) || 0;
  return {
    age: Number(row.age ?? row.edad) || 0,
    heartRate,
    spo2: Number(row.spo2) || 0,
    systolic,
    diastolic: Number(row.diastolic ?? row.pad) || 0,
    temperature: Number(row.temperature ?? row.temp) || 0,
    respiratoryRate: Number(row.respiratoryRate ?? row.fr) || 0,
    news: news2Score(row),
    shock: heartRate / Math.max(40, systolic),
    comorbidity,
    condition: condition ? condition.severity : 30,
  };
}

