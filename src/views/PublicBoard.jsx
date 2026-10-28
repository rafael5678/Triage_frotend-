import { useEffect, useState } from "react";
import { fetchBoard, subscribeEvents } from "../services/api";
import { levelInfo } from "../models/levels";

/** Con eventos en vivo basta un respaldo lento; sin ellos se consulta más seguido. */
const REFRESH_LIVE_MS = 90000;
const REFRESH_MS = 20000;

/** Pantalla de sala de espera (sin login): turno, área y tiempo, sin nombres. */
export default function PublicBoard() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    let pending;
    async function load() {
      try {
        const data = await fetchBoard();
        if (!alive) return;
        setRows(data || []);
        setStatus("ok");
      } catch {
        if (alive) setStatus((s) => (s === "ok" ? "ok" : "offline"));
      }
    }
    load();
    const stop = subscribeEvents(() => {
      clearTimeout(pending);
      pending = setTimeout(load, 500);
    }, setLive);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => {
      alive = false;
      stop();
      clearTimeout(pending);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        setRows((await fetchBoard()) || []);
        setStatus("ok");
      } catch {
        setStatus((s) => (s === "ok" ? "ok" : "offline"));
      }
    }, live ? REFRESH_LIVE_MS : REFRESH_MS);
    return () => clearInterval(poll);
  }, [live]);

  const waiting = rows.filter((r) => r.status === "EN_ESPERA");
  const inCare = rows.filter((r) => r.status === "EN_ATENCION");

  return (
    <div className="board">
      <header className="board-head">
        <div>
          <p className="eyebrow">Urgencias · sala de espera</p>
          <h1>Se atiende primero al más grave</h1>
          <p className="lede">Busque su turno (iniciales y últimos 3 números del documento). El orden puede cambiar si llega alguien más grave.</p>
        </div>
        <div className="board-clock">
          <b>{now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</b>
          <small>{now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</small>
        </div>
      </header>

      {status === "loading" && <p className="board-msg">Cargando la sala… si el servidor estaba dormido puede tardar un minuto.</p>}
      {status === "offline" && <p className="board-msg">No hay conexión con el servidor. Se reintenta solo cada 20 segundos.</p>}
      {status === "ok" && <p className={`board-live ${live ? "on" : ""}`}>{live ? "● En vivo" : "Actualización cada 20 s"}</p>}

      <section className="board-grid">
        <div>
          <h2>En espera ({waiting.length})</h2>
          {status === "ok" && waiting.length === 0 && <p className="board-msg">No hay nadie esperando.</p>}
          <ol className="board-list">
            {waiting.map((r) => {
              const level = levelInfo(r.triageLevel);
              return (
                <li key={`${r.ticket}-${r.position}`} className={`board-row ${level.tone} ${r.present === false ? "away" : ""}`}>
                  <em>{r.position}</em>
                  <strong>
                    {r.ticket}
                    {r.present === false && <small className="board-note">No se encuentra en la sala · acérquese a triaje</small>}
                    {r.present !== false && r.overdue && <small className="board-note">Superó el tiempo previsto · si se siente peor, avise en triaje</small>}
                  </strong>
                  <span className={`chip ${level.tone}`}>{level.chip}</span>
                  <span className="board-area">
                    {r.destinationArea || "Por asignar"}
                    {r.destinationCode && <small>{r.destinationCode}</small>}
                  </span>
                  <span className="board-wait">
                    <b>{r.estimatedWaitMinutes === 0 ? "Ya" : `~${r.estimatedWaitMinutes} min`}</b>
                    <small>lleva {r.waitedMinutes} min</small>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <aside>
          <h2>En atención</h2>
          {inCare.length === 0 && <p className="board-msg">Nadie en atención ahora.</p>}
          <ul className="board-care">
            {inCare.map((r) => (
              <li key={`care-${r.ticket}`}>
                <strong>{r.ticket}</strong>
                <span>{r.destinationArea}</span>
              </li>
            ))}
          </ul>
          <div className="board-legend">
            <p><span className="chip i">Crítica</span> se atiende ya</p>
            <p><span className="chip ii">Alta</span> hasta 10 min</p>
            <p><span className="chip iii">Media</span> hasta 30 min</p>
            <p><span className="chip iv">Baja</span> hasta 60 min</p>
            <p><span className="chip v">Mínima</span> hasta 120 min</p>
          </div>
        </aside>
      </section>
      <footer className="board-foot">
        <a href="#/">Volver al ingreso del personal</a>
      </footer>
    </div>
  );
}
