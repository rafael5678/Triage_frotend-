/** stats: staff UI module. User-facing copy stays in Spanish. */
import { waitInfo } from "./notice";
import { LEVELS } from "./levels";

const STATUS_CODES = {
  "En espera": "EN_ESPERA",
  "En atención": "EN_ATENCION",
  Atendido: "ATENDIDO",
  Cancelado: "CANCELADO",
  EN_ESPERA: "EN_ESPERA",
  EN_ATENCION: "EN_ATENCION",
  ATENDIDO: "ATENDIDO",
  CANCELADO: "CANCELADO",
};

function statusCode(patient) {
  return STATUS_CODES[patient.statusCode] || STATUS_CODES[patient.status] || "EN_ESPERA";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

const BOGOTA = "America/Bogota";

function bogotaParts(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: BOGOTA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  );
  const hour = String(parts.hour).padStart(2, "0");
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    key: `${parts.year}-${parts.month}-${parts.day}T${hour}`,
  };
}

function hourBucket(ms, nowMs) {
  const at = bogotaParts(ms);
  const today = bogotaParts(nowMs).dateKey;
  const yesterday = bogotaParts(nowMs - 24 * 3600000).dateKey;
  let dayTag = at.dateKey;
  if (at.dateKey === today) dayTag = "Hoy";
  else if (at.dateKey === yesterday) dayTag = "Ayer";
  const pretty = new Date(ms).toLocaleDateString("es-CO", {
    timeZone: BOGOTA,
    weekday: "long",
    day: "numeric",
    month: "short",
  });
  return {
    key: at.key,
    dateKey: at.dateKey,
    timeLabel: `${at.hour}:00`,
    dayTag,
    dayLabel: `${dayTag} · ${pretty}`,
    startMs: ms,
    count: 0,
  };
}

/** Same numbers the statistics screen shows, from the live patient list in the database. */
export function statsFromPatients(rows, now = Date.now()) {
  const all = Array.isArray(rows) ? rows : [];
  const byLevel = Object.fromEntries(Object.keys(LEVELS).map((key) => [key, 0]));
  const byStatus = { EN_ESPERA: 0, EN_ATENCION: 0, ATENDIDO: 0, CANCELADO: 0 };
  const byArea = {};
  const byCondition = {};
  let scoreSum = 0;
  let scored = 0;
  let withAi = 0;
  const waits = [];
  const toCare = [];
  let overdue = 0;

  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  const arrivalsLast24 = [];
  const arrivalsByHour = {};
  for (let i = 23; i >= 0; i -= 1) {
    const bucket = hourBucket(end.getTime() - i * 3600000, now);
    arrivalsLast24.push(bucket);
    arrivalsByHour[bucket.key] = bucket;
  }

  for (const patient of all) {
    const code = statusCode(patient);
    byStatus[code] = (byStatus[code] || 0) + 1;
    if (patient.triageLevel && byLevel[patient.triageLevel] != null) {
      byLevel[patient.triageLevel] += 1;
    }
    const area = patient.destinationArea || "Sin área";
    byArea[area] = (byArea[area] || 0) + 1;
    const condition = patient.conditionId || "sin-motivo";
    byCondition[condition] = (byCondition[condition] || 0) + 1;
    if (Number.isFinite(Number(patient.score))) {
      scoreSum += Number(patient.score);
      scored += 1;
    }
    if (patient.iaActive) withAi += 1;
    if (code === "EN_ESPERA") {
      const wait = waitInfo(patient, now);
      waits.push(wait.waited);
      if (wait.overdue) overdue += 1;
    }
    if (patient.careStartedAt && (patient.arrivedAt || patient.evaluatedAt)) {
      const start = patient.arrivedAt || patient.evaluatedAt;
      toCare.push(Math.max(0, Math.round((patient.careStartedAt - start) / 60000)));
    }
    const arrived = patient.arrivedAt || patient.evaluatedAt;
    if (arrived && now - arrived < 24 * 3600000) {
      const bucket = arrivalsByHour[bogotaParts(arrived).key];
      if (bucket) bucket.count += 1;
    }
  }

  const topConditions = Object.fromEntries(
    Object.entries(byCondition).sort((a, b) => b[1] - a[1]).slice(0, 8)
  );
  const sortedAreas = Object.fromEntries(Object.entries(byArea).sort((a, b) => b[1] - a[1]));

  return {
    totalPatients: all.length,
    waiting: byStatus.EN_ESPERA || 0,
    inCare: byStatus.EN_ATENCION || 0,
    attended: byStatus.ATENDIDO || 0,
    averageScore: scored ? round1(scoreSum / scored) : null,
    averageWaitingMinutes: waits.length ? round1(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
    longestWaitingMinutes: waits.length ? Math.max(...waits) : null,
    aiActivePercent: all.length ? round1((100 * withAi) / all.length) : null,
    overdue,
    averageTimeToCareMinutes: toCare.length ? round1(toCare.reduce((a, b) => a + b, 0) / toCare.length) : null,
    byLevel,
    byArea: sortedAreas,
    byStatus,
    byCondition: topConditions,
    arrivalsByHour: Object.fromEntries(arrivalsLast24.map((b) => [b.timeLabel, b.count])),
    arrivalsLast24,
  };
}
