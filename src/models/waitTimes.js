import { priorityFromScore } from "../ml/model";

/** ESI / triage target times (minutes). Protocol reference, not a promise. */
export const CARE_TARGETS = [
  { id: "I", minScore: 78, maxScore: 100, label: "Crítica", wait: 2, detail: "Se atiende al momento. No espera en sala." },
  { id: "II", minScore: 62, maxScore: 77, label: "Alta", wait: 10, detail: "Muy grave: meta de atender en unos 10 minutos." },
  { id: "III", minScore: 42, maxScore: 61, label: "Media", wait: 30, detail: "Urgente, pero cede el puesto a los más graves." },
  { id: "IV", minScore: 22, maxScore: 41, label: "Baja", wait: 60, detail: "Puede esperar cerca de una hora si hay casos peores." },
  { id: "V", minScore: 0, maxScore: 21, label: "Mínima", wait: 120, detail: "Lo menos grave: la espera puede llegar a unas 2 horas." },
];

const MAX_WAIT = 120;

export function careTargetForScore(score) {
  return CARE_TARGETS.find((t) => score >= t.minScore) || CARE_TARGETS[4];
}

export function waitSharePercent(score) {
  const target = careTargetForScore(score);
  return Math.round((target.wait / MAX_WAIT) * 100);
}

/** People with a higher score are seen first; then protocol time for this level. */
export function estimateWaitMinutes(score, queue = []) {
  const target = careTargetForScore(score);
  const ahead = queue.filter((p) => Number(p.score) > Number(score)).length;
  return target.wait + ahead * 8;
}

export function waitSummary(score, queue = []) {
  const priority = priorityFromScore(score);
  const target = careTargetForScore(score);
  const minutes = estimateWaitMinutes(score, queue);
  const ahead = queue.filter((p) => Number(p.score) > Number(score)).length;
  return {
    priority,
    target,
    minutes,
    ahead,
    sharePercent: waitSharePercent(score),
    text: ahead
      ? `Hay ${ahead} persona(s) más grave(s) delante. Meta de espera ~${minutes} min.`
      : `Nadie más grave delante. Meta de espera ~${target.wait} min (${target.label}). Más alto el puntaje, más urgente (no al revés).`,
  };
}
