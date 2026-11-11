/** StatsView: staff UI module. User-facing copy stays in Spanish. */
import { useEffect, useState } from "react";
import { fetchPatients } from "../services/api";
import { LEVELS } from "../models/levels";
import { statsFromPatients } from "../models/stats";

const STATUS_LABELS = { EN_ESPERA: "En espera", EN_ATENCION: "En atención", ATENDIDO: "Atendido", CANCELADO: "Cancelado" };

function Bars({ data, labelOf = (k) => k, toneOf = () => "", empty }) {
  const entries = Object.entries(data || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (!entries.length || entries.every(([, v]) => v === 0)) return <p className="muted">{empty}</p>;
  return (
    <div className="hbars">
      {entries.map(([key, value]) => (
        <div key={key} className="hbar">
          <span>{labelOf(key)}</span>
          <i><b className={toneOf(key)} style={{ width: `${(value / max) * 100}%` }} /></i>
          <em>{value}</em>
        </div>
      ))}
    </div>
  );
}

/** Room statistics from the same patients already in the database. */
export default function StatsView({ conditionLabel = (id) => id, patients = null, loadingList = false }) {
  const [stats, setStats] = useState(() => (Array.isArray(patients) ? statsFromPatients(patients) : null));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!Array.isArray(patients));

  async function load() {
    if (Array.isArray(patients)) {
      setStats(statsFromPatients(patients));
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      setStats(statsFromPatients(await fetchPatients()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Array.isArray(patients)) {
      setStats(statsFromPatients(patients));
      setLoading(loadingList && patients.length === 0);
      setError("");
      return undefined;
    }
    load();
    return undefined;
  }, [patients, loadingList]);

  const hours = stats?.arrivalsLast24 || [];
  const maxHour = Math.max(1, ...hours.map((h) => h.count));
  const hourTotal = hours.reduce((sum, h) => sum + h.count, 0);
  const dayBands = [];
  for (const h of hours) {
    const last = dayBands[dayBands.length - 1];
    if (last && last.dateKey === h.dateKey) last.span += 1;
    else dayBands.push({ dateKey: h.dateKey, label: h.dayLabel, span: 1 });
  }
  const busy = loading || (loadingList && !stats);

  return (
    <section className="page">
      <div className="hero-line">
        <div>
          <h1>Estadísticas de la sala</h1>
          <p className="sub">Calculadas con los pacientes guardados en la base. Pulse actualizar para volver a leerla.</p>
        </div>
        <button className="ghost" onClick={load} disabled={busy}>{busy ? "Cargando…" : "Actualizar"}</button>
      </div>
      {error && <p className="form-err">{error}</p>}
      {stats && (
        <>
          <div className="stats six">
            <article><small>Pacientes</small><b>{stats.totalPatients}</b></article>
            <article><small>En espera</small><b>{stats.waiting}</b></article>
            <article><small>En atención</small><b>{stats.inCare}</b></article>
            <article><small>Puntaje medio</small><b>{stats.averageScore ?? "—"}</b></article>
            <article><small>Espera promedio (min)</small><b>{stats.averageWaitingMinutes ?? "—"}</b></article>
            <article className={stats.overdue ? "crit" : ""}><small>Pasaron su tiempo máximo</small><b>{stats.overdue ?? 0}</b></article>
          </div>
          <div className="stats six">
            <article><small>Llegada → atención (min, promedio)</small><b>{stats.averageTimeToCareMinutes ?? "—"}</b></article>
            <article><small>Con lectura del caso</small><b>{stats.aiActivePercent == null ? "—" : `${stats.aiActivePercent}%`}</b></article>
          </div>
          {stats.longestWaitingMinutes != null && (
            <p className="muted">La persona que más lleva esperando: {stats.longestWaitingMinutes} minutos.</p>
          )}
          <div className="split">
            <div className="sheet">
              <h3>Por nivel de triaje</h3>
              <Bars
                data={stats.byLevel}
                labelOf={(k) => `${LEVELS[k]?.id || k} · ${LEVELS[k]?.chip || ""}`}
                toneOf={(k) => `tone-${LEVELS[k]?.tone || "v"}`}
                empty="Todavía no hay triajes."
              />
              <h3>Por área de urgencias</h3>
              <Bars data={stats.byArea} empty="Sin destinos aún." />
            </div>
            <div className="sheet">
              <h3>Estado</h3>
              <Bars data={stats.byStatus} labelOf={(k) => STATUS_LABELS[k] || k} empty="Sin pacientes." />
              <h3>Motivos más frecuentes</h3>
              <Bars data={stats.byCondition} labelOf={conditionLabel} empty="Sin motivos aún." />
            </div>
          </div>
          <div className="sheet hour-chart" style={{ marginTop: 16 }}>
            <h3>Ingresos por hora · últimas 24 h</h3>
            <p className="sub">
              Cada barra es <b>una hora en Colombia</b> (de esa hora a :59).
              {" "}La barra más alta es cuando más gente llegó.
              {" "}En estas 24 h: <b>{hourTotal}</b> ingreso{hourTotal === 1 ? "" : "s"}.
            </p>
            <div className="hour-chart-scroll">
              <div className="hour-chart-inner">
                <div className="hour-day-row">
                  {dayBands.map((band) => (
                    <div key={band.dateKey} className="hour-day-band" style={{ gridColumn: `span ${band.span}` }}>
                      {band.label}
                    </div>
                  ))}
                </div>
                <div className="hour-bars">
                  {hours.map((h) => (
                    <div
                      key={h.key}
                      className={`hour-col ${h.count ? "has-in" : ""}`}
                      title={`${h.dayLabel}, ${h.timeLabel} a ${h.timeLabel.replace(":00", ":59")}: ${h.count} ingreso${h.count === 1 ? "" : "s"}`}
                    >
                      <span className="hour-n">{h.count ? h.count : ""}</span>
                      <i style={{ height: `${Math.max(h.count ? 8 : 2, (h.count / maxHour) * 100)}%` }} />
                      <small>{h.timeLabel}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted hour-legend">Ejemplo: <b>01:00</b> son las personas que llegaron entre la 1:00 y la 1:59 de esa madrugada.</p>
          </div>
        </>
      )}
    </section>
  );
}
