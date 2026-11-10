/** ShiftReport: staff UI module. User-facing copy stays in Spanish. */
import { useEffect, useMemo, useState } from "react";
import { LEVELS } from "../models/levels";
import { waitInfo } from "../models/notice";
import {
  SHIFTS,
  arrivedMs,
  buildShiftCsv,
  buildShiftReport,
  calendarTodayIso,
  clampReportDate,
  currentShift,
  hhmm,
  minutesToCare,
  todayIso,
  windowOf,
} from "../models/shiftReport";
import { fetchPatients } from "../services/api";

export default function ShiftReport({ patients, conditionLabel, user }) {
  const [shiftId, setShiftId] = useState(currentShift());
  const [date, setDate] = useState(() => clampReportDate(todayIso()));
  const maxDate = calendarTodayIso();
  const [livePatients, setLivePatients] = useState(patients);
  const { start, end, shift } = windowOf(shiftId, date);

  useEffect(() => { setLivePatients(patients); }, [patients]);
  useEffect(() => {
    fetchPatients().then(setLivePatients).catch(() => {});
  }, []);

  const report = useMemo(
    () => buildShiftReport(livePatients || [], { start, end, date }),
    [livePatients, start, end, date]
  );

  function downloadCsv() {
    const blob = new Blob(
      [buildShiftCsv(report, { shift, date, user, conditionLabel })],
      { type: "text/csv;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reporte-turno-completo-${date}-${shiftId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const levelKeys = Object.keys(LEVELS);
  const when = new Date(start).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <section className="page report">
      <div className="hero-line no-print">
        <div>
          <h1>Reporte del turno</h1>
          <p className="sub">Para la entrega de turno: quién llegó, qué tan rápido se atendió y quién sigue esperando.</p>
        </div>
        <div className="row-btns">
          <button className="ghost" onClick={downloadCsv}>Descargar CSV</button>
          <button className="btn" onClick={() => window.print()}>Imprimir / PDF</button>
        </div>
      </div>
      <div className="report-filters no-print">
        <label>Turno
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            {SHIFTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label>Fecha de inicio
          <input
            type="date"
            value={date}
            max={maxDate}
            onChange={(e) => setDate(clampReportDate(e.target.value))}
          />
        </label>
      </div>
      <p className="sub no-print">
        Este turno ({shift.label}): <b>{report.rows.length}</b> ingreso{report.rows.length === 1 ? "" : "s"}.
        {" "}Día 7:00–7:00 del {date}: <b>{report.todayRows.length}</b> en total.
        {shiftId !== "dia" && report.todayRows.length > report.rows.length
          ? " Los que llegaron en otra franja aparecen al elegir Mañana, Noche o Día completo."
          : ""}
        {report.carryover.length > 0
          ? ` Quedaron ${report.carryover.length} del turno anterior (siguen en espera o en atención).`
          : ""}
      </p>

      <header className="print-only">
        <h1>Urgencias · reporte del turno (completo)</h1>
        <p>
          {shift.label} · {when}
          {" "}· generado por {user?.displayName} a las {hhmm(Date.now())}
        </p>
        <p>
          Ingresos del turno: {report.rows.length}
          {" · "}día 7:00–7:00: {report.todayRows.length}
          {" · "}pasaron a atención: {report.startedCare.length}
          {" · "}promedio a atención: {report.avg == null ? "—" : `${report.avg} min`}
          {" · "}más tardó / p90: {report.p90 == null ? "—" : `${report.p90} min`}
          {" · "}dentro de meta: {report.startedCare.length ? `${report.onTime} de ${report.startedCare.length}` : "—"}
          {" · "}esperando · vencidos: {report.stillWaiting.length} · {report.overdue.length}
        </p>
      </header>

      <div className="stats">
        <article><small>Ingresos de este turno</small><b>{report.rows.length}</b></article>
        <article><small>Ingresos del día (7:00–7:00)</small><b>{report.todayRows.length}</b></article>
        <article><small>Pasaron a atención</small><b>{report.startedCare.length}</b></article>
        <article><small>Minutos hasta atención (promedio)</small><b>{report.avg ?? "—"}</b></article>
        <article>
          <small>{report.useP90 ? "9 de cada 10 pasó a atención en" : "El que más tardó a atención"}</small>
          <b>{report.p90 == null ? "—" : `${report.p90} min`}</b>
        </article>
        <article className={report.onTimePercent != null && report.onTimePercent < 80 ? "crit" : ""}>
          <small>Dentro de su meta de espera</small>
          <b>{report.startedCare.length ? `${report.onTime} de ${report.startedCare.length}` : "—"}</b>
        </article>
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
            <li>Terminaron atención (alta): <b>{report.finished.length}</b></li>
            <li>Con signos no medidos (había que tomarlos): <b>{report.estimated}</b></li>
            <li className="muted">Minutos y meta = llegada vs. hora de pasar a atención, iguales que en el detalle. El 90% solo se muestra si hay 5 o más con hora de atención.</li>
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
            <thead>
              <tr>
                <th>Llegó</th>
                <th>Paciente</th>
                <th>Documento</th>
                <th>Nivel</th>
                <th>Área / código</th>
                <th>Atención</th>
                <th>Estado</th>
                <th>Teléfono</th>
                <th>Signos</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((p) => {
                const minutes = minutesToCare(p);
                const late = minutes != null && minutes > (p.maxWaitMinutes ?? 30);
                const chip = p.priority?.chip || LEVELS[p.triageLevel]?.chip;
                const tone = p.priority?.tone || LEVELS[p.triageLevel]?.tone || "v";
                const score = Number.isFinite(Number(p.score)) ? Number(p.score).toFixed(1) : "—";
                return (
                  <tr key={p.id}>
                    <td>{hhmm(p.arrivedAt || p.evaluatedAt)}</td>
                    <td>
                      <b>{p.name}</b>
                      <div className="muted">{p.age} años · {conditionLabel(p.conditionId)}{p.pregnant ? " · embarazo" : ""}</div>
                    </td>
                    <td className="document">{p.document || "—"}</td>
                    <td><span className={`chip ${tone}`}>{chip}</span> {score}</td>
                    <td>{p.destinationArea}{p.destinationCode && <div className="muted">{p.destinationCode}</div>}</td>
                    <td className={late ? "late" : ""}>
                      {minutes == null ? "—" : `${hhmm(p.careStartedAt)} · ${minutes} min`}
                      {late && <div className="muted">pasó la meta de {p.maxWaitMinutes ?? 30}</div>}
                    </td>
                    <td>{p.status}{p.notifiedChannel && <div className="muted">avisado ({p.notifiedChannel === "WHATSAPP" ? "WhatsApp" : "manual"})</div>}</td>
                    <td>{p.phone || "—"}</td>
                    <td>{p.evaluatedBy || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {report.carryover.length > 0 && (
        <div className="sheet table-wrap" style={{ marginTop: 16 }}>
          <h3>Ya estaban (llegaron antes de este turno)</h3>
          <p className="muted">Siguen en espera o en atención; no son ingresos nuevos de esta franja.</p>
          <ul className="bullets">
            {report.carryover.map((p) => (
              <li key={p.id}>
                <b>{p.name}</b>
                {p.document ? ` · ${p.document}` : ""}
                {" · llegó "}{hhmm(arrivedMs(p))}
                {" · "}{p.status}
                {" · "}{LEVELS[p.triageLevel]?.chip || p.priority?.chip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
