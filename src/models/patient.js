import { findSymptom } from "./catalog";
import { CONDITIONS } from "../ml/conditions";
import { news2Score } from "../ml/dataset";
import { getModel, predictScore, priorityFromScore } from "../ml/model";

const LEVEL_ORDER = {
  TRIAGE_I_ROJO: 0,
  TRIAGE_II_NARANJA: 1,
  TRIAGE_III_AMARILLO: 2,
  TRIAGE_IV_VERDE: 3,
  TRIAGE_V_AZUL: 4,
};

export function documentDigits(raw) {
  return String(raw || "").replace(/\D/g, "").slice(0, 10);
}

export function documentError(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length < 5) return `Lleva ${digits.length} de 5 a 10 dígitos. Una cédula colombiana no tiene 20 números.`;
  if (digits.length > 10) return "Máximo 10 dígitos (cédula o TI).";
  return "";
}

export function ticketCode(patientOrName, document) {
  const name = typeof patientOrName === "string" ? patientOrName : (patientOrName?.name || "");
  const docRaw = typeof patientOrName === "string" ? document : (patientOrName?.document || "");
  const initials = String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "P";
  const doc = String(docRaw || "").replace(/\s/g, "");
  const tail = doc.length >= 3 ? doc.slice(-3) : doc;
  return tail ? `${initials}-${tail}` : initials;
}

export function isElderly(patient) {
  return Number(patient?.age) >= 65;
}

export function comparePriority(a, b) {
  const la = LEVEL_ORDER[a.triageLevel] ?? 9;
  const lb = LEVEL_ORDER[b.triageLevel] ?? 9;
  if (la !== lb) return la - lb;
  const ea = isElderly(a) ? 1 : 0;
  const eb = isElderly(b) ? 1 : 0;
  if (ea !== eb) return eb - ea;
  if (b.score !== a.score) return b.score - a.score;
  return (a.arrivedAt || 0) - (b.arrivedAt || 0);
}

export function waitingMinutes(patient) {
  if (!patient.arrivedAt) return 0;
  return Math.max(0, Math.floor((Date.now() - patient.arrivedAt) / 60000));
}

export function createPatient(data, model) {
  const trained = model || getModel().model;
  const normalized = {
    ...data,
    age: Number(data.age ?? data.edad),
    heartRate: Number(data.heartRate ?? data.fc),
    spo2: Number(data.spo2),
    systolic: Number(data.systolic ?? data.pas),
    diastolic: Number(data.diastolic ?? data.pad),
    temperature: Number(data.temperature ?? data.temp),
    respiratoryRate: Number(data.respiratoryRate ?? data.fr),
    conditionId: data.conditionId || data.lesionId,
    comorbidityIds: data.comorbidityIds || data.comorbIds || [],
  };
  const score = predictScore(trained, normalized);
  return {
    ...normalized,
    id: data.id || crypto.randomUUID(),
    name: data.name || data.nombre,
    document: data.document || data.doc,
    score,
    news2: news2Score(normalized),
    priority: priorityFromScore(score),
    status: data.status || data.estado || "En espera",
    arrivedAt: data.arrivedAt || data.llegada || Date.now(),
    conditionLabel: findSymptom(normalized.conditionId)?.label || CONDITIONS.find((c) => c.id === normalized.conditionId)?.label,
  };
}
