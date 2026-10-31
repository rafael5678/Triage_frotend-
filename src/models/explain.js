import { findSymptom } from "./catalog";
import { CONDITIONS } from "../ml/conditions";
import { news2Score } from "../ml/dataset";
import { priorityFromScore } from "../ml/model";

function num(v) {
  return Number(v);
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

  const estimated = new Set(patient.estimatedFields || []);
  const reasons = [];
  if (spo2 < 90) reasons.push(`El oxígeno en la sangre está muy bajo (${spo2}%). Lo normal es 95 a 100. Eso sube mucho el puntaje.`);
  else if (spo2 < 94) reasons.push(`El oxígeno está un poco bajo (${spo2}%). Lo normal es 95 a 100.`);
  else if (spo2 >= 95) reasons.push(`El oxígeno está en un rango aceptable (${spo2}%).`);

  if (hr > 130 || hr < 40) reasons.push(`El corazón va muy alterado (${hr} latidos por minuto). En un adulto suele estar entre 60 y 100.`);
  else if (hr > 110 || hr < 50) reasons.push(`El pulso no está en el rango habitual (${hr} latidos por minuto).`);

  if (sbp < 90) reasons.push(`La presión está baja (${sbp}/${dbp}). Eso puede significar que el cuerpo no está bombeando bien.`);
  else if (sbp > 180) reasons.push(`La presión está muy alta (${sbp}/${dbp}).`);

  if (temp >= 39) reasons.push(`Hay fiebre alta (${temp} °C).`);
  else if (temp <= 35.5) reasons.push(`La temperatura está baja (${temp} °C).`);

  if (rr >= 25 || rr <= 8) reasons.push(`La respiración está alterada (${rr} por minuto). En reposo suele ser 12 a 20.`);

  if (age >= 75) reasons.push(`La edad (${age} años) aumenta el riesgo si los signos se descompensan.`);
  if (condition) reasons.push(`El motivo de consulta (“${condition.label}”) también entra en el cálculo.`);

  const comorbidities = patient.comorbidityIds || patient.comorbIds || [];
  if (comorbidities.length) reasons.push("Tiene enfermedades de base; eso hace el caso más delicado.");

  if (news >= 7) reasons.push(`El índice NEWS2 (escala hospitalaria de 0 a 20) salió en ${news}: alerta alta.`);
  else if (news >= 5) reasons.push(`NEWS2 = ${news}: hay que vigilar de cerca.`);
  else reasons.push(`NEWS2 = ${news} (0 es lo más estable en esa escala).`);

  const danger = [];
  if (spo2 < 90) danger.push("casi no le llega oxígeno a la sangre");
  if (hr > 130 || hr < 40) danger.push("el corazón no late como debería");
  if (sbp < 90) danger.push("la presión está demasiado baja");
  if (temp <= 35) danger.push("el cuerpo está muy frío");
  if (rr >= 25 || rr <= 8) danger.push("no está respirando de forma estable");

  const iaReasons = (patient.iaReasons || []).filter(Boolean);
  const merged = [...reasons];
  iaReasons.forEach((r) => {
    if (!merged.includes(r)) merged.push(r);
  });

  const measuredDanger = danger.length && !estimated.size;
  const dangerLead = patient.dangerLead
    || (measuredDanger ? `Está grave porque ${danger.join(", ")}.` : (estimated.size
      ? "Varios signos no se midieron: el puntaje sigue sobre todo el motivo de consulta, no un shock inventado."
      : priority.meaning));

  return {
    score,
    news2: news,
    priority,
    dangerLead,
    headline: `Puntaje ${score} de 100 · ${priority.chip}`,
    meaning: patient.aiMeaning || patient.meaningIa || priority.meaning,
    whyQueue: score >= 62
      ? "Por este puntaje va adelante de quien llegó antes si esa persona está más estable."
      : "No es el caso más grave de la sala, según estos números.",
    reasons: merged.slice(0, 8),
    iaActive: Boolean(patient.iaActive),
  };
}
