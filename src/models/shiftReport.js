/** shiftReport: numbers for the shift handoff. On-screen copy stays Spanish. */
import { LEVELS } from "./levels";
import { waitInfo } from "./notice";

export const SHIFTS = [
  { id: "manana", label: "Mañana (7:00–13:00)", from: 7, hours: 6 },
  { id: "tarde", label: "Tarde (13:00–19:00)", from: 13, hours: 6 },
  { id: "noche", label: "Noche (19:00–7:00)", from: 19, hours: 12 },
  { id: "dia", label: "Día completo (24 h)", from: 0, hours: 24 },
];

export function currentShift(now = new Date()) {
  const h = now.getHours();
  if (h >= 7 && h < 13) return "manana";
  if (h >= 13 && h < 19) return "tarde";
  return "noche";
}

function padIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function calendarTodayIso(now = new Date()) {
  return padIso(now);
}

export function todayIso(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return padIso(d);
}

export function clampReportDate(value, now = new Date()) {
  const max = calendarTodayIso(now);
  if (!value || value > max) return max;
  return value;
}

export function windowOf(shiftId, dateIso) {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  const [y, m, d] = dateIso.split("-").map(Number);
  const start = new Date(y, m - 1, d, shift.from, 0, 0).getTime();
  return { start, end: start + shift.hours * 3600000, shift };
}

export function dayWindow(dateIso) {
  const [y, m, d] = dateIso.split("-").map(Number);
  const start = new Date(y, m - 1, d, 7, 0, 0).getTime();
  return { start, end: start + 24 * 3600000 };
}

export function minutesToCare(p) {
  if (!p.careStartedAt || !p.arrivedAt) return null;
  return Math.max(0, Math.round((p.careStartedAt - p.arrivedAt) / 60000));
}

export function arrivedMs(p) {
  const n = Number(p.arrivedAt || p.evaluatedAt);
  return Number.isFinite(n) ? n : 0;
}

export function stillInHospital(p) {
  return p.status === "En espera" || p.status === "En atención" || p.statusCode === "EN_ESPERA" || p.statusCode === "EN_ATENCION";
}

export function hhmm(ms) {
  return ms ? new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
}

function levelKeyOf(p) {
  if (p.triageLevel && LEVELS[p.triageLevel]) return p.triageLevel;
  const chip = p.priority?.chip;
  return Object.keys(LEVELS).find((k) => LEVELS[k].chip === chip) || p.triageLevel;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function count(list, keyOf) {
  return list.reduce((acc, item) => {
    const k = keyOf(item);
    if (k) acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvLine(cells) {
  return cells.map(csvCell).join(";");
}

export function buildShiftReport(source, { start, end, date }) {
  const day = dayWindow(date);
  const rows = source
    .filter((p) => {
      const at = arrivedMs(p);
      return at >= start && at < end;
    })
    .sort((a, b) => arrivedMs(a) - arrivedMs(b));
  const todayRows = source
    .filter((p) => {
      const at = arrivedMs(p);
      return at >= day.start && at < day.end;
    })
    .sort((a, b) => arrivedMs(a) - arrivedMs(b));
  const carryover = source
    .filter((p) => stillInHospital(p) && arrivedMs(p) && arrivedMs(p) < start)
    .sort((a, b) => arrivedMs(a) - arrivedMs(b));
  const now = Date.now();
  const startedCare = rows.filter((p) => p.careStartedAt);
  const finished = rows.filter((p) => p.status === "Atendido" || p.statusCode === "ATENDIDO");
  const toCare = startedCare.map(minutesToCare).filter((n) => n != null);
  const onTime = startedCare.filter((p) => {
    const minutes = minutesToCare(p);
    if (minutes == null) return false;
    return minutes <= (p.maxWaitMinutes ?? 30);
  }).length;
  const stillWaiting = rows.filter((p) => p.status === "En espera" || p.statusCode === "EN_ESPERA");
  const overdue = stillWaiting.filter((p) => waitInfo(p, now).overdue);
  const absent = stillWaiting.filter((p) => p.present === false);
  const avg = toCare.length ? Math.round(toCare.reduce((a, b) => a + b, 0) / toCare.length) : null;
  const sorted = [...toCare].sort((a, b) => a - b);
  const slowest = sorted.length ? sorted[sorted.length - 1] : null;
  const p90 = toCare.length >= 5 ? percentile(sorted, 90) : slowest;
  return {
    rows,
    todayRows,
    carryover,
    startedCare,
    finished,
    avg,
    p90,
    slowest,
    useP90: toCare.length >= 5,
    onTime,
    onTimePercent: startedCare.length ? Math.round((onTime / startedCare.length) * 100) : null,
    stillWaiting,
    overdue,
    absent,
    byLevel: count(rows, levelKeyOf),
    byArea: count(rows, (p) => p.destinationArea),
    codes: count(rows, (p) => (p.destinationCode || "").split(" · ").find((c) => c.startsWith("Código"))),
    notified: count(rows, (p) => p.notifiedChannel),
    pregnant: rows.filter((p) => p.pregnant).length,
    children: rows.filter((p) => Number(p.age) < 14).length,
    cancelled: rows.filter((p) => p.status === "Cancelado" || p.statusCode === "CANCELADO").length,
    estimated: rows.filter((p) => p.estimatedFields?.length).length,
  };
}

function stamp(ms) {
  return ms ? new Date(ms).toLocaleString("es-CO") : "";
}

export function buildShiftCsv(report, { shift, date, user, conditionLabel }) {
  const lines = [
    csvLine(["Reporte del turno (completo)"]),
    csvLine(["Turno", shift.label]),
    csvLine(["Fecha de inicio", date]),
    csvLine(["Generado", stamp(Date.now())]),
    csvLine(["Generado por", user?.displayName || ""]),
    "",
    csvLine(["RESUMEN"]),
    csvLine(["Dato", "Valor"]),
    csvLine(["Ingresos de este turno", report.rows.length]),
    csvLine(["Ingresos del día (7:00-7:00)", report.todayRows.length]),
    csvLine(["Pasaron a atención", report.startedCare.length]),
    csvLine(["Minutos hasta atención (promedio)", report.avg ?? ""]),
    csvLine([report.useP90 ? "9 de cada 10 pasó a atención en (min)" : "El que más tardó a atención (min)", report.p90 ?? ""]),
    csvLine(["Dentro de su meta de espera", report.startedCare.length ? `${report.onTime} de ${report.startedCare.length}` : ""]),
    csvLine(["Siguen esperando", report.stillWaiting.length]),
    csvLine(["Vencidos", report.overdue.length]),
    csvLine(["Terminaron atención (alta)", report.finished.length]),
    csvLine(["Cancelados / se fueron", report.cancelled]),
    csvLine(["Embarazadas", report.pregnant]),
    csvLine(["Menores de 14 años", report.children]),
    csvLine(["No han llegado a la sala", report.absent.length]),
    csvLine(["WhatsApp automático", report.notified.WHATSAPP || 0]),
    csvLine(["Aviso manual", report.notified.MANUAL || 0]),
    csvLine(["Signos no medidos", report.estimated]),
    csvLine(["Quedaron del turno anterior", report.carryover.length]),
    "",
    csvLine(["POR NIVEL DE TRIAJE"]),
    csvLine(["Nivel", "Nombre", "Cantidad"]),
    ...Object.keys(LEVELS).map((k) => csvLine([LEVELS[k].chip, LEVELS[k].id, report.byLevel[k] || 0])),
    "",
    csvLine(["POR ÁREA"]),
    csvLine(["Área", "Cantidad"]),
    ...(Object.keys(report.byArea).length
      ? Object.entries(report.byArea).map(([k, v]) => csvLine([k, v]))
      : [csvLine(["Sin ingresos", 0])]),
    "",
    csvLine(["CÓDIGOS ACTIVADOS"]),
    ...(Object.keys(report.codes).length
      ? Object.entries(report.codes).map(([k, v]) => csvLine([k, v]))
      : [csvLine(["ninguno", 0])]),
    "",
    csvLine(["DETALLE DE INGRESOS DEL TURNO"]),
    csvLine([
      "Llegada", "Nombre", "Documento", "Edad", "Sexo", "Embarazo", "Motivo", "Puntaje", "Nivel",
      "Área", "Código", "Estado", "Inicio atención", "Minutos hasta atención", "Meta (min)",
      "Dentro de meta", "Tomó los signos", "Presente", "Aviso", "Teléfono",
    ]),
    ...report.rows.map((p) => {
      const minutes = minutesToCare(p);
      const meta = p.maxWaitMinutes ?? 30;
      const onTime = minutes == null ? "" : minutes <= meta ? "Sí" : "No";
      return csvLine([
        stamp(p.arrivedAt || p.evaluatedAt),
        p.name,
        p.document,
        p.age,
        p.sex,
        p.pregnant ? "Sí" : "No",
        conditionLabel(p.conditionId),
        Number.isFinite(Number(p.score)) ? Number(p.score).toFixed(1) : "",
        LEVELS[p.triageLevel]?.chip || p.priority?.chip || p.triageLevel,
        p.destinationArea,
        p.destinationCode,
        p.status,
        p.careStartedAt ? stamp(p.careStartedAt) : "",
        minutes ?? "",
        meta,
        onTime,
        p.evaluatedBy,
        p.present === false ? "No" : "Sí",
        p.notifiedChannel,
        p.phone,
      ]);
    }),
    "",
    csvLine(["YA ESTABAN (llegaron antes de este turno)"]),
    csvLine(["Llegada", "Nombre", "Documento", "Nivel", "Estado", "Motivo"]),
    ...report.carryover.map((p) => csvLine([
      stamp(arrivedMs(p)),
      p.name,
      p.document,
      LEVELS[p.triageLevel]?.chip || p.priority?.chip,
      p.status,
      conditionLabel(p.conditionId),
    ])),
    "",
    csvLine(["PENDIENTES PARA EL SIGUIENTE TURNO"]),
    csvLine(["Nombre", "Nivel", "Minutos de espera", "Meta (min)", "Presente"]),
    ...report.overdue.map((p) => csvLine([
      p.name,
      LEVELS[p.triageLevel]?.chip || p.priority?.chip,
      waitInfo(p).waited,
      p.maxWaitMinutes ?? 30,
      p.present === false ? "No" : "Sí",
    ])),
  ];
  return `\uFEFF${lines.join("\n")}`;
}
