import { priorityFromScore } from "../ml/model";

const AUTH_URL = import.meta.env.VITE_AUTH_URL || (import.meta.env.DEV ? "http://localhost:8081" : "");
const EVAL_URL = import.meta.env.VITE_EVAL_URL || (import.meta.env.DEV ? "http://localhost:8082" : "");
const QUEUE_URL = import.meta.env.VITE_QUEUE_URL || (import.meta.env.DEV ? "http://localhost:8083" : "");
const AI_URL = import.meta.env.VITE_AI_URL || (import.meta.env.DEV ? "http://localhost:8084" : "");

async function request(base, path, options = {}, timeoutMs = 60000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || "Error de API");
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("El servidor tardó demasiado en responder (puede estar despertando).");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

const STATUS = {
  EN_ESPERA: "En espera",
  EN_ATENCION: "En atención",
  ATENDIDO: "Atendido",
  CANCELADO: "Cancelado",
};

function list(value) {
  return Array.isArray(value) ? value : [];
}

function historyToIds(history) {
  if (!history) return [];
  return String(history).split(",").map((s) => s.trim()).filter(Boolean);
}

export function mapFromApi(row) {
  const score = Number(row.riskScore ?? row.scoreRiesgo ?? 0);
  const arrivedAt = (row.evaluatedAt || row.evaluadoEn) ? new Date(row.evaluatedAt || row.evaluadoEn).getTime() : Date.now();
  const statusCode = row.status || row.estado;
  const history = row.history || row.antecedentes || "";
  return {
    id: row.patientId || row.pacienteId,
    name: row.name || row.nombre,
    document: row.document || row.documento,
    age: row.age ?? row.edad,
    sex: row.sex || row.sexo || "M",
    conditionId: row.conditionId || row.lesionId,
    reason: row.reason || row.motivo || "",
    history,
    spo2: row.spo2,
    heartRate: row.heartRate ?? row.frecuenciaCardiaca,
    systolic: row.systolic ?? row.presionSistolica,
    diastolic: row.diastolic ?? row.presionDiastolica,
    temperature: row.temperature ?? row.temperatura,
    respiratoryRate: row.respiratoryRate ?? row.frecuenciaRespiratoria,
    glucose: row.glucose ?? row.glucosa ?? null,
    painScale: row.painScale ?? row.dolor ?? null,
    consciousness: row.consciousness || row.conciencia || "",
    score,
    news2: row.news2,
    triageLevel: row.triageLevel,
    priority: priorityFromScore(score),
    status: STATUS[statusCode] || statusCode || "En espera",
    arrivedAt,
    comorbidityIds: historyToIds(history),
    scoreSource: row.scoreSource || row.fuenteScore,
    iaActive: Boolean(row.aiActive ?? row.iaActiva),
    dangerLead: row.dangerLead,
    aiMeaning: row.aiMeaning || row.meaningIa,
    iaReasons: row.aiReasons || row.razonesIa || [],
    datasetReasons: row.datasetReasons || row.razonesDataset || [],
    geminiReasons: row.geminiReasons || row.razonesGemini || [],
    protocolScore: row.protocolScore ?? row.scoreProtocolo,
    geminiScore: row.geminiScore ?? row.scoreGemini,
    immediateActions: list(row.immediateActions),
    testsToOrder: list(row.testsToOrder),
    monitoring: list(row.monitoring),
    redFlags: list(row.redFlags),
    symptomExplanation: row.symptomExplanation || "",
    photoFindings: row.photoFindings || "",
    destinationArea: row.destinationArea || "",
    destinationCode: row.destinationCode || "",
    destinationReason: row.destinationReason || "",
    maxWaitMinutes: row.maxWaitMinutes ?? null,
    estimatedFields: list(row.estimatedFields),
  };
}

export async function fetchPatients() {
  const rows = await request(QUEUE_URL, "/api/v1/triage/patients");
  return rows.map(mapFromApi);
}

function intakeBody(form) {
  const history = (form.comorbidityIds || form.comorbIds || []).join(", ");
  return {
    name: form.name || form.nombre,
    document: form.document || form.doc,
    age: Number(form.age ?? form.edad),
    sex: form.sex || form.sexo,
    conditionId: form.conditionId || form.lesionId,
    reason: form.reason || form.motivo,
    history,
  };
}

function optionalNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function vitalsBody(form, patientId, { withPhoto = true } = {}) {
  const body = {
    heartRate: Number(form.heartRate ?? form.fc),
    spo2: Number(form.spo2),
    systolic: Number(form.systolic ?? form.pas),
    diastolic: Number(form.diastolic ?? form.pad),
    temperature: Number(form.temperature ?? form.temp),
    respiratoryRate: Number(form.respiratoryRate ?? form.fr),
    glucose: optionalNumber(form.glucose),
    painScale: optionalNumber(form.painScale),
    consciousness: form.consciousness || null,
    estimatedFields: form.estimatedFields || [],
  };
  if (withPhoto && form.photo?.dataUrl) {
    body.photoBase64 = form.photo.dataUrl;
    body.photoMime = form.photo.mime;
  }
  if (patientId) body.patientId = patientId;
  return body;
}

export async function registerAndScore(form) {
  const created = await request(AUTH_URL, "/api/v1/triage/patients", {
    method: "POST",
    body: JSON.stringify(intakeBody(form)),
  });
  const scored = await request(EVAL_URL, "/api/v1/triage/evaluations", {
    method: "POST",
    body: JSON.stringify(vitalsBody(form, created.patientId || created.pacienteId || created.id)),
  }, 90000);
  return mapFromApi(scored);
}

export async function analyzeTriage(form, localModelScore) {
  const scored = await request(EVAL_URL, "/api/v1/triage/analyze", {
    method: "POST",
    body: JSON.stringify({
      ...intakeBody(form),
      ...vitalsBody(form),
      localModelScore: localModelScore == null ? null : Number(localModelScore),
    }),
  }, 90000);
  return mapFromApi(scored);
}

export async function reevaluatePatient(id, form) {
  const scored = await request(EVAL_URL, `/api/v1/triage/evaluations/${id}/reassess`, {
    method: "PUT",
    body: JSON.stringify(vitalsBody(form, null, { withPhoto: false })),
  }, 90000);
  return mapFromApi(scored);
}

export async function startCare(id) {
  return mapFromApi(await request(QUEUE_URL, `/api/v1/triage/care/${id}`, { method: "PATCH" }));
}

export async function login(credentials) {
  return request(AUTH_URL, "/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username: credentials.username,
      password: credentials.password,
    }),
  });
}

/** La IA convierte el relato (y la foto) en el formulario. known son los datos que ya escribió el personal. */
export async function intakeWithAi({ story, photo, known, comorbidityOptions }) {
  return request(AI_URL, "/api/v1/ia/intake", {
    method: "POST",
    body: JSON.stringify({
      story,
      photoBase64: photo?.dataUrl || null,
      photoMime: photo?.mime || null,
      known,
      comorbidityOptions,
    }),
  }, 90000);
}

export async function explainField(field, value, context) {
  return request(AI_URL, "/api/v1/ia/explain", {
    method: "POST",
    body: JSON.stringify({ field, value: value === "" || value == null ? null : String(value), context }),
  });
}

export async function fetchStats() {
  return request(QUEUE_URL, "/api/v1/triage/stats");
}

export async function fetchBoard() {
  return request(QUEUE_URL, "/api/v1/triage/board");
}

export async function fetchSymptoms() {
  return request(AI_URL, "/api/v1/catalog/symptoms");
}

export async function fetchAdminSymptoms() {
  return request(AI_URL, "/api/v1/admin/symptoms");
}

export async function saveSymptom(payload) {
  return request(AI_URL, "/api/v1/admin/symptoms", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminUsers() {
  return request(AUTH_URL, "/api/v1/admin/users");
}

export async function createUser(payload) {
  return request(AUTH_URL, "/api/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function setUserActive(id, active) {
  return request(AUTH_URL, `/api/v1/admin/users/${id}/active?active=${active}`, { method: "PATCH" });
}
