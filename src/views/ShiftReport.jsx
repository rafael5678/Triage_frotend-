import { useMemo, useState } from "react";
import { LEVELS } from "../models/levels";
import { waitInfo } from "../models/notice";

const SHIFTS = [
  { id: "manana", label: "Mañana (7:00–13:00)", from: 7, hours: 6 },
  { id: "tarde", label: "Tarde (13:00–19:00)", from: 13, hours: 6 },
  { id: "noche", label: "Noche (19:00–7:00)", from: 19, hours: 12 },
  { id: "dia", label: "Día completo (24 h)", from: 0, hours: 24 },
];

function currentShift(now = new Date()) {
  const h = now.getHours();
  if (h >= 7 && h < 13) return "manana";
  if (h >= 13 && h < 19) return "tarde";
  return "noche";
}

function todayIso(now = new Date()) {
  const d = new Date(now);
  if (d.getHours() < 7) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function windowOf(shiftId, dateIso) {
  const shift = SHIFTS.find((s) => s.id === shiftId);
  const [y, m, d] = dateIso.split("-").map(Number);
  const start = new Date(y, m - 1, d, shift.from, 0, 0).getTime();
  return { start, end: start + shift.hours * 3600000, shift };
}

function hhmm(ms) {
  return ms ? new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }) : "";
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

/** Resumen del turno para la entrega de turno y el indicador de oportunidad en urgencias. */
export default function ShiftReport({ patients, conditionLabel, user }) {
  const [shiftId, setShiftId] = useState(currentShift());
  const [date, setDate] = useState(todayIso());
  const { start, end, shift } = windowOf(shiftId, date);

  const report = useMemo(() => {
    const rows = patients
      .filter((p) => p.arrivedAt >= start && p.arrivedAt < end)
      .sort((a, b) => a.arrivedAt - b.arrivedAt);
    const now = Date.now();
    const cared = rows.filter((p) => p.careStartedAt);
    const toCare = cared.map((p) => Math.max(0, Math.round((p.careStartedAt - p.arrivedAt) / 60000)));
    const onTime = cared.filter((p) => (p.careStartedAt - p.arrivedAt) / 60000 <= (p.maxWaitMinutes ?? 30)).length;
    const stillWaiting = rows.filter((p) => p.status === "En espera");
    const overdue = stillWaiting.filter((p) => waitInfo(p, now).overdue);
    const absent = stillWaiting.filter((p) => p.present === false);
    const avg = toCare.length ? Math.round(toCare.reduce((a, b) => a + b, 0) / toCare.length) : null;
    const sorted = [...toCare].sort((a, b) => a - b);
    const p90 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : null;
    return {
      rows,
      cared,
      avg,
      p90,
      onTimePercent: cared.length ? Math.round((onTime / cared.length) * 100) : null,
      stillWaiting,
      overdue,
      absent,
      byLevel: count(rows, (p) => p.triageLevel),
      byArea: count(rows, (p) => p.destinationArea),
      codes: count(rows, (p) => (p.destinationCode || "").split(" · ").find((c) => c.startsWith("Código"))),
      notified: count(rows, (p) => p.notifiedChannel),
      pregnant: rows.filter((p) => p.pregnant).length,
      children: rows.filter((p) => Number(p.age) < 14).length,
      cancelled: rows.filter((p) => p.status === "Cancelado").length,
      estimated: rows.filter((p) => p.estimatedFields?.length).length,
    };
  }, [patients, start, end]);

  function downloadCsv() {
    const header = ["Llegada", "Nombre", "Documento", "Edad", "Sexo", "Motivo", "Puntaje", "Nivel", "Área", "Código",
      "Estado", "Inicio atención", "Minutos hasta atención", "Meta (min)", "Tomó los signos", "Presente", "Aviso", "Teléfono"];
    const lines = report.rows.map((p) => [
      new Date(p.arrivedAt).toLocaleString("es-CO"),
      p.name, p.document, p.age, p.sex, conditionLabel(p.conditionId), p.score.toFixed(1),
      LEVELS[p.triageLevel]?.chip || p.triageLevel, p.destinationArea, p.destinationCode, p.status,
      p.careStartedAt ? new Date(p.careStartedAt).toLocaleString("es-CO") : "",
      p.careStartedAt ? Math.round((p.careStartedAt - p.arrivedAt) / 60000) : "",
      p.maxWaitMinutes ?? "", p.evaluatedBy, p.present ? "Sí" : "No", p.notifiedChannel, p.phone,
    ].map(csvCell).join(";"));
    const blob = new Blob([`\uFEFF${[header.join(";"), ...lines].join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-turno-${date}-${shiftId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const levelKeys = Object.keys(LEVELS);

  return (
    <section className="page report">
      <div className="hero-line no-print">
        <div>
          <h1>Reporte del turno</h1>
          <p className="sub">Para la entrega de turno: quién llegó, qué tan rápido se atendió y quién sigue esperando.</p>
        </div>
        <div className="row-btns">
          <button className="ghost" onClick={downloadCsv} disabled={!report.rows.length}>Descargar CSV</button>
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      <div className="report-filters no-print">
        <label>Turno
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            {SHIFTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label>Fecha de inicio<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>

      <header className="print-only">
        <h1>Urgencias · reporte del turno</h1>
        <p>{shift.label} · {new Date(start).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · generado por {user?.displayName} a las {hhmm(Date.now())}</p>
      </header>

      <div className="stats six">
        <article><small>Ingresos</small><b>{report.rows.length}</b></article>
        <article><small>Atendidos</small><b>{report.cared.length}</b></article>
        <article><small>Minutos hasta atención (promedio)</small><b>{report.avg ?? "—"}</b></article>
        <article><small>El 90% se atendió en</small><b>{report.p90 == null ? "—" : `${report.p90} min`}</b></article>
        <article className={report.onTimePercent != null && report.onTimePercent < 80 ? "crit" : ""}><small>Atendidos dentro de su meta</small><b>{report.onTimePercent == null ? "—" : `${report.onTimePercent}%`}</b></article>
        <article className={report.overdue.length ? "crit" : ""}><small>Siguen esperando · vencidos</small><b>{report.stillWaiting.length} · {report.overdue.length}</b></article>
      </div>

      <div className="split">
        <div className="sheet">
          <h3>Por nivel de triaje</h3>
          <table className="mini-table">
            <tbody>
              {levelKeys.map((k) => (
                <tr key={k}><td><span className={`chip ${LEVELS[k].tone}`}>{LEVELS[k].chip}</span></td><td>{LEVELS[k].id}</td><td><b>{report.byLevel[k] || 0}</b></td></tr>
              ))}
            </tbody>
          </table>
          <h3>Por área</h3>
          {Object.keys(report.byArea).length === 0 && <p className="muted">Sin ingresos en este turno.</p>}
          <ul className="bullets">{Object.entries(report.byArea).map(([k, v]) => <li key={k}>{k}: <b>{v}</b></li>)}</ul>
        </div>
        <div className="sheet">
          <h3>Para tener en cuenta</h3>
          <ul className="bullets">
            <li>Códigos activados: {Object.keys(report.codes).length ? Object.entries(report.codes).map(([k, v]) => `${k} (${v})`).join(", ") : "ninguno"}</li>
            <li>Embarazadas: <b>{report.pregnant}</b> · Menores de 14 años: <b>{report.children}</b></li>
            <li>Registrados que no han llegado a la sala: <b>{report.absent.length}</b></li>
            <li>Avisos de turno: WhatsApp automático <b>{report.notified.WHATSAPP || 0}</b> · manual <b>{report.notified.MANUAL || 0}</b></li>
            <li>Cancelados / se fueron: <b>{report.cancelled}</b></li>
            <li>Con signos estimados por IA (había que medirlos): <b>{report.estimated}</b></li>
          </ul>
          {report.overdue.length > 0 && (
            <>
              <h3>Pendientes para el siguiente turno</h3>
              <ul className="bullets">
                {report.overdue.map((p) => (
                  <li key={p.id}><b>{p.name}</b> · {LEVELS[p.triageLevel]?.chip} · lleva {waitInfo(p).waited} min (meta {p.maxWaitMinutes ?? 30}){p.present === false ? " · no ha llegado" : ""}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="sheet table-wrap" style={{ marginTop: 16 }}>
        <h3>Detalle</h3>
        {report.rows.length === 0 && <p className="muted">No hubo ingresos en este turno.</p>}
        {report.rows.length > 0 && (
          <table>
            <thead><tr><th>Llegó</th><th>Paciente</th><th>Nivel</th><th>Área / código</th><th>Atención</th><th>Estado</th><th>Signos</th></tr></thead>
            <tbody>
              {report.rows.map((p) => {
                const minutes = p.careStartedAt ? Math.round((p.careStartedAt - p.arrivedAt) / 60000) : null;
                const late = minutes != null && minutes > (p.maxWaitMinutes ?? 30);
                return (
                  <tr key={p.id}>
                    <td>{hhmm(p.arrivedAt)}</td>
                    <td><b>{p.name}</b><div className="muted">{p.age} años · {conditionLabel(p.conditionId)}{p.pregnant ? " · embarazo" : ""}</div></td>
                    <td><span className={`chip ${p.priority.tone}`}>{p.priority.chip}</span> {p.score.toFixed(1)}</td>
                    <td>{p.destinationArea}{p.destinationCode && <div className="muted">{p.destinationCode}</div>}</td>
                    <td className={late ? "late" : ""}>{minutes == null ? "—" : `${hhmm(p.careStartedAt)} · ${minutes} min`}{late && <div className="muted">pasó la meta de {p.maxWaitMinutes ?? 30}</div>}</td>
                    <td>{p.status}{p.notifiedChannel && <div className="muted">avisado ({p.notifiedChannel === "WHATSAPP" ? "WhatsApp" : "manual"})</div>}</td>
                    <td>{p.evaluatedBy || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
