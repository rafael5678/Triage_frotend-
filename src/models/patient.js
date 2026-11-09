/** patient: staff UI module. User-facing copy stays in Spanish. */
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

export function matchesPatientSearch(patient, raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (!q) return true;
  const name = String(patient.name || "").toLowerCase();
  const docRaw = String(patient.document || "").toLowerCase();
  const doc = docRaw.replace(/\D/g, "");
  const digits = q.replace(/\D/g, "");
  if (name.includes(q)) return true;
  if (docRaw.includes(q.replace(/\s/g, ""))) return true;
  if (digits.length >= 1 && doc.includes(digits)) return true;
  return false;
}

export function documentError(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length < 5) return `Lleva ${digits.length} de 5 a 10 dígitos. Una cédula colombiana no tiene 20 números.`;
  if (digits.length > 10) return "Máximo 10 dígitos (cédula o TI).";
  return "";
}

/**
 * Guía according to la edad. Nunca bloquea: en Colombia conviven NUIP de 10 dígitos (suelen
 * empezar en 1, p. ej. 10…) y documents antiguas más cortas o con prefijo 50–69.
 */
export function documentAgeHint(raw, age) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 10) return "";
  const n = Number(age);
  if (!Number.isFinite(n)) {
    return "5 a 10 dígitos. Jóvenes: casi siempre 10 que empiezan en 1. Mayores: a veces 6–8 dígitos o prefijo 50–69.";
  }
  if (n < 18) {
    if (digits.startsWith("1") && digits.length >= 8) {
      return "TI habitual en menores: 8 a 10 dígitos, muchas empiezan en 1. Se acepta.";
    }
    return "En menores suele ser tarjeta de identidad (a menudo 10 dígitos que empiezan en 1). Si es el número real, se acepta.";
  }
  if (n < 40) {
    if (digits.length === 10 && digits.startsWith("1")) {
      return `Cédula NUIP de 10 dígitos (como las que empiezan en 10…): encaja con ${n} años.`;
    }
    if (digits.length <= 8) {
      return `A los ${n} años lo más habitual es cédula de 10 dígitos que empieza en 1. Si el número es real, se guarda igual.`;
    }
    return `Cédula de ${digits.length} dígitos. A esta edad suele ser NUIP de 10 que empieza en 1; se acepta tal cual.`;
  }
  if (/^(5\d|6\d)/.test(digits) && digits.length >= 6) {
    return `Prefijo de cédula antigua (50–69): frecuente en adultas mayores. Encaja con ${n} años.`;
  }
  if (digits.length <= 8) {
    return `Cédula corta de generación anterior: frecuente pasados los 40. Se acepta.`;
  }
  if (digits.length === 10 && digits.startsWith("1")) {
    return "Cédula renovada (NUIP de 10 dígitos). También es válida a esta edad.";
  }
  return `Cédula de ${digits.length} dígitos. En mayores de 40 hay de todo: cortas, 50–69 o NUIP de 10. Se acepta.`;
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
