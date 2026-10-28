import { useEffect, useState } from "react";
import { fetchStats, subscribeEvents } from "../services/api";
import { LEVELS } from "../models/levels";

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

/** Estadísticas de la sala que calcula ms-cola-espera con los datos de la base. */
export default function StatsView({ conditionLabel = (id) => id }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setStats(await fetchStats());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    let timer;
    const stop = subscribeEvents(() => {
      clearTimeout(timer);
      timer = setTimeout(load, 800);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, []);

  const hours = Object.entries(stats?.arrivalsByHour || {});
  const maxHour = Math.max(1, ...hours.map(([, v]) => v));

  return (
    <section className="page">
      <div className="hero-line">
        <div>
          <h1>Estadísticas de la sala</h1>
          <p className="sub">Calculadas con los pacientes guardados en la base. Se actualizan solas cuando cambia la sala.</p>
        </div>
        <button className="ghost" onClick={load} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</button>
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
            <article><small>Con IA activa</small><b>{stats.aiActivePercent == null ? "—" : `${stats.aiActivePercent}%`}</b></article>
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
          <div className="sheet" style={{ marginTop: 16 }}>
            <h3>Ingresos por hora (últimas 24 h)</h3>
            <div className="vbars">
              {hours.map(([hour, count]) => (
                <div key={hour} className="vbar" title={`${hour}: ${count}`}>
                  <i style={{ height: `${(count / maxHour) * 100}%` }} />
                  <small>{hour.slice(0, 2)}</small>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
