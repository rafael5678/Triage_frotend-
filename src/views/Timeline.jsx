import { useEffect, useState } from "react";
import { fetchHistory } from "../services/api";

const W = 320;
const H = 110;
const PAD = 14;

function clock(ms) {
  return new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function day(ms) {
  return new Date(ms).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

/** Qué cambió entre dos mediciones, en palabras. */
function changes(prev, next) {
  if (!prev) return [];
  const out = [];
  const add = (label, a, b, unit = "") => {
    if (a == null || b == null || Number(a) === Number(b)) return;
    out.push(`${label} ${a}→${b}${unit}`);
  };
  add("Oxígeno", prev.spo2, next.spo2, "%");
  add("Pulso", prev.heartRate, next.heartRate);
  add("Presión", prev.systolic, next.systolic);
  add("Resp.", prev.respiratoryRate, next.respiratoryRate);
  add("Temp.", prev.temperature, next.temperature, "°");
  add("Glucosa", prev.glucose, next.glucose);
  if ((prev.consciousness || "") !== (next.consciousness || "") && next.consciousness) out.push(`Conciencia ${prev.consciousness || "—"}→${next.consciousness}`);
  return out;
}

function Chart({ rows }) {
  if (rows.length < 2) return null;
  const t0 = rows[0].evaluatedAt;
  const t1 = rows[rows.length - 1].evaluatedAt;
  const span = Math.max(1, t1 - t0);
  const x = (t) => PAD + ((t - t0) / span) * (W - PAD * 2);
  const y = (s) => H - PAD - (Math.min(100, Math.max(0, s)) / 100) * (H - PAD * 2);
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(r.evaluatedAt).toFixed(1)},${y(r.score).toFixed(1)}`).join(" ");
  return (
    <svg className="tl-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del puntaje">
      {[62, 80].map((g) => (
        <g key={g}>
          <line x1={PAD} x2={W - PAD} y1={y(g)} y2={y(g)} className="tl-grid" />
          <text x={W - PAD} y={y(g) - 3} className="tl-grid-label">{g}</text>
        </g>
      ))}
      <path d={path} className="tl-line" />
      {rows.map((r) => (
        <circle key={r.evaluatedAt} cx={x(r.evaluatedAt)} cy={y(r.score)} r="4" className={`tl-dot ${r.priority.tone}`}>
          <title>{`${clock(r.evaluatedAt)} · ${r.score.toFixed(1)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Línea de tiempo de una visita: cada vez que se midieron signos, quién lo hizo y cómo cambió el puntaje. */
export default function Timeline({ patientId, refreshKey }) {
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetchHistory(patientId)
      .then((list) => {
        if (!alive) return;
        setRows(list);
        setState("ok");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [patientId, refreshKey]);

  if (state === "loading") return <p className="muted">Cargando evolución…</p>;
  if (state === "error") return <p className="muted">No se pudo cargar el historial.</p>;
  if (!rows.length) return <p className="muted">Sin mediciones guardadas.</p>;

  const last = rows[rows.length - 1];
  const visit = rows.filter((r) => r.arrivedAt === last.arrivedAt);
  const first = visit[0];
  const delta = last.score - first.score;
  const earlierVisits = rows.length - visit.length;

  return (
    <div className="timeline">
      {visit.length > 1 && (
        <p className={`tl-trend ${delta > 2 ? "up" : delta < -2 ? "down" : ""}`}>
          {delta > 2 ? "Empeoró" : delta < -2 ? "Mejoró" : "Estable"}: {first.score.toFixed(1)} → {last.score.toFixed(1)} en {visit.length} mediciones de esta visita
        </p>
      )}
      {earlierVisits > 0 && <p className="muted">Tiene {earlierVisits} medición(es) de visitas anteriores (abajo).</p>}
      <Chart rows={visit} />
      <ol className="tl-list">
        {rows.slice().reverse().map((r, i, all) => {
          const prev = all[i + 1];
          const newVisit = !prev || prev.arrivedAt !== r.arrivedAt;
          const diff = newVisit ? [] : changes(prev, r);
          return (
            <li key={r.evaluatedAt} className={r.priority.tone}>
              <span className="tl-time">{clock(r.evaluatedAt)}<small>{day(r.evaluatedAt)}</small></span>
              <div>
                <b>{r.score.toFixed(1)}</b> <span className={`chip ${r.priority.tone}`}>{r.priority.chip}</span>
                {r.destinationCode && <small className="muted"> · {r.destinationCode}</small>}
                <div className="muted">
                  SpO₂ {r.spo2}% · FC {r.heartRate} · PA {r.systolic}/{r.diastolic} · FR {r.respiratoryRate} · {r.temperature}°C
                </div>
                {diff.length > 0 && <div className="tl-diff">{diff.join(" · ")}</div>}
                <small className="muted">{r.evaluatedBy ? `Tomó los signos: ${r.evaluatedBy}` : "Sin registro de quién evaluó"}{newVisit ? " · ingreso" : " · reevaluación"}</small>
              </div>
            </li>
          );
        })}
      </ol>
      {last.careStartedAt && (
        <p className="muted">Pasó a atención a las {clock(last.careStartedAt)} ({Math.max(0, Math.round((last.careStartedAt - last.arrivedAt) / 60000))} min después de llegar).</p>
      )}
    </div>
  );
}
