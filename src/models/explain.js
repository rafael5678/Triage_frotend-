/** explain: staff UI module. User-facing copy stays in Spanish. */
import { findSymptom } from "./catalog";
import { CONDITIONS } from "../ml/conditions";
import { news2Score } from "../ml/dataset";
import { priorityFromScore } from "../ml/model";
import { ageNorms, rangeText } from "./ageNorms";
import { readVitals } from "./vitals";

function num(v) {
  return Number(v);
}

function inRange(n, pair) {
  return Number.isFinite(n) && n >= pair[0] && n <= pair[1];
}

function signsLookFine(patient) {
  const rows = readVitals(patient);
  const measured = rows.filter((r) => r.value != null && !r.estimated);
  if (!measured.length) return false;
  return measured.every((r) => r.tone === "ok");
}

function blamesFineSigns(text) {
  const t = String(text || "").toLowerCase();
  if (!t) return true;
  if (t.includes("no por los signos") || t.includes("no porque los signos") || t.includes("signos están en rango")
      || t.includes("signos en rango") || t.includes("signos medidos estén estables")) {
    return false;
  }
  return (t.includes("signo") && (t.includes("peligro") || t.includes("grave") || t.includes("mal") || t.includes("inmediat")))
    || t.includes("cuerpo está en peligro")
    || t.includes("peligro inmediato")
    || (t.includes("oxígeno") && (t.includes("bajo") || t.includes("no le llega")));
}

/** Plain-Spanish reasons from the actual vital signs of this patient. */
export function explainWhy(patient) {
  const spo2 = num(patient.spo2);
  const hr = num(patient.heartRate ?? patient.fc);
  const sbp = num(patient.systolic ?? patient.pas);
  const dbp = num(patient.diastolic ?? patient.pad);
  const temp = num(patient.temperature ?? patient.temp);
  const rr = num(patient.respiratoryRate ?? patient.fr);
  const age = num(patient.age ?? patient.edad);
  const score = num(patient.score);
  const priority = patient.priority || priorityFromScore(score);
  const condition = findSymptom(patient.conditionId || patient.lesionId)
    || CONDITIONS.find((c) => c.id === (patient.conditionId || patient.lesionId));
  const news = news2Score(patient);
  const fine = signsLookFine(patient);
  const hasPhoto = Boolean(patient.photoFindings);
  const motif = condition?.label || "el motivo de consulta";

  const estimated = new Set(patient.estimatedFields || []);
  const n = ageNorms(age, { pregnant: Boolean(patient.pregnant), weeks: patient.gestationWeeks });
  const reasons = [];

  if (fine && score >= 42) {
    reasons.push(`Los signos medidos están en rango para ${n.label}: no son la razón de este puntaje.`);
    reasons.push(`El puntaje sale sobre todo por el motivo (“${motif}”)${hasPhoto ? " y por la foto" : ""}.`);
  } else {
    if (spo2 > 100) reasons.push(`Pusieron oxígeno ${spo2}. A los ${n.label} lo habitual es 95 a 100. Se guarda el número que midieron.`);
    else if (spo2 < 90) reasons.push(`El oxígeno en la sangre está muy bajo (${spo2}%). Lo normal a los ${n.label} es 95 a 100. Eso sube mucho el puntaje.`);
    else if (spo2 < 94) reasons.push(`El oxígeno está un poco bajo (${spo2}%). Lo normal a los ${n.label} es 95 a 100.`);
    else if (spo2 >= 95) reasons.push(`El oxígeno está en un rango aceptable (${spo2}%). A los ${n.label} lo habitual es 95 a 100.`);

    if (hr > n.hr[1] * 1.3 || hr < n.hr[0] * 0.7) {
      reasons.push(`El corazón va muy alterado (${hr} latidos por minuto). A los ${n.label} en reposo suele estar entre ${rangeText(n.hr)}.`);
    } else if (hr > n.hr[1] || hr < n.hr[0]) {
      reasons.push(`El pulso no está en el rango habitual (${hr}). A los ${n.label} en reposo suele estar entre ${rangeText(n.hr)}.`);
    } else if (Number.isFinite(hr)) {
      reasons.push(`El pulso (${hr}) encaja con lo habitual a los ${n.label} (${rangeText(n.hr)}).`);
    }

    if (sbp < 90) reasons.push(`La presión está baja (${sbp}/${dbp}). Eso puede significar que el cuerpo no está bombeando bien.`);
    else if (sbp > 180) reasons.push(`La presión está muy alta (${sbp}/${dbp}).`);
    else if (inRange(sbp, n.sbp)) reasons.push(`La presión (${sbp}/${dbp}) encaja con ${n.label}; no sube el puntaje por signos.`);

    if (temp >= 39) reasons.push(`Hay fiebre alta (${temp} °C).`);
    else if (temp <= 35.5) reasons.push(`La temperatura está baja (${temp} °C).`);

    if (rr >= 25 || rr <= 8) reasons.push(`La respiración está alterada (${rr} por minuto). En reposo suele ser 12 a 20.`);
  }

  if (age >= 75) reasons.push(`La edad (${age} años) aumenta el riesgo si los signos se descompensan.`);
  if (condition) reasons.push(`El motivo de consulta (“${condition.label}”) entra en el cálculo del protocolo.`);

  const comorbidities = patient.comorbidityIds || patient.comorbIds || [];
  if (comorbidities.length) reasons.push("Tiene enfermedades de base; eso hace el caso más delicado.");

  if (news >= 7) reasons.push(`El índice NEWS2 (escala hospitalaria de 0 a 20) salió en ${news}: alerta alta.`);
  else if (news >= 5) reasons.push(`NEWS2 = ${news}: hay que vigilar de cerca.`);
  else reasons.push(`NEWS2 = ${news} (0 es lo más estable en esa escala). Con signos en rango, NEWS2 bajo no explica un puntaje alto.`);

  const danger = [];
  if (spo2 < 90) danger.push("casi no le llega oxígeno a la sangre");
  if (hr > 130 || hr < 40) danger.push("el corazón no late como debería");
  if (sbp < 90) danger.push("la presión está demasiado baja");
  if (temp <= 35) danger.push("el cuerpo está muy frío");
  if (rr >= 25 || rr <= 8) danger.push("no está respirando de forma estable");

  const iaReasons = (patient.iaReasons || []).filter((r) => !(fine && blamesFineSigns(r)));
  const merged = [...reasons];
  iaReasons.forEach((r) => {
    if (!merged.includes(r)) merged.push(r);
  });

  const honestLead = fine && score >= 42
    ? `El puntaje ${score} sale por el motivo (“${motif}”)${hasPhoto ? " y por la foto" : ""}, no por los signos: oxígeno, pulso, presión y respiración están en rango.`
    : null;
  const measuredDanger = danger.length && !estimated.size;
  const rawLead = patient.dangerLead;
  const dangerLead = (rawLead && !blamesFineSigns(rawLead))
    ? rawLead
    : (honestLead
      || (measuredDanger ? `Está grave porque ${danger.join(", ")}.` : (estimated.size
        ? "Varios signos no se midieron: el puntaje sigue sobre todo el motivo de consulta, no un shock inventado."
        : priority.meaning)));

  const drivers = [
    fine
      ? "Signos: en rango para la edad. No explican un puntaje alto."
      : "Signos: hay números fuera de rango; esos sí mueven el puntaje.",
    condition
      ? `Motivo: “${condition.label}”${patient.reason ? ` — ${patient.reason}` : ""}.`
      : "Motivo: no indicado.",
    hasPhoto ? `Foto: ${patient.photoFindings}` : "Foto: no hay.",
  ];

  return {
    score,
    news2: news,
    priority,
    dangerLead,
    drivers,
    headline: `Puntaje ${score} de 100 · ${priority.chip}`,
    meaning: (patient.aiMeaning || patient.meaningIa) && !blamesFineSigns(patient.aiMeaning || patient.meaningIa)
      ? (patient.aiMeaning || patient.meaningIa)
      : (fine && score >= 62
        ? `Va adelante en la cola por el tipo de caso (“${motif}”), aunque los signos estén estables.`
        : priority.meaning),
    whyQueue: score >= 62
      ? (fine
        ? "Por el motivo (y la foto, si hay) va adelante de quien llegó antes si esa persona está más estable. No es porque los signos estén mal."
        : "Por este puntaje va adelante de quien llegó antes si esa persona está más estable.")
      : "No es el caso más grave de la sala, según estos números.",
    reasons: merged.slice(0, 8),
    iaActive: Boolean(patient.iaActive),
  };
}
