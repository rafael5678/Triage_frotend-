import { useEffect, useRef, useState } from "react";
import { fetchBoard, subscribeEvents } from "../services/api";
import { levelInfo } from "../models/levels";

const REFRESH_LIVE_MS = 90000;
const REFRESH_MS = 8000;

function speakTicket(ticket, area) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const said = String(ticket || "").replace(/-/g, " ");
  const u = new SpeechSynthesisUtterance(`Turno ${said}. Pase a ${area || "triaje"}`);
  u.lang = "es-CO";
  u.rate = 0.92;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

/** Pantalla de sala (sin login): turno, área y tiempo, sin nombres. */
export default function PublicBoard() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("loading");
  const [now, setNow] = useState(new Date());
  const [live, setLive] = useState(false);
  const lastCalled = useRef("");

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
        if (alive) setStatus((s) => (s === "ok" ? "ok" : "waking"));
      }
    }
    load();
    const stop = subscribeEvents(() => {
      clearTimeout(pending);
      pending = setTimeout(load, 400);
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
        setStatus((s) => (s === "ok" ? "ok" : "waking"));
      }
    }, live ? REFRESH_LIVE_MS : REFRESH_MS);
    return () => clearInterval(poll);
  }, [live]);

  const waiting = rows.filter((r) => r.status === "EN_ESPERA");
  const inCare = rows.filter((r) => r.status === "EN_ATENCION");
  const next = waiting[0];
  const rest = waiting.slice(1);

  useEffect(() => {
    if (!next?.ticket) return;
    if (!lastCalled.current) {
      lastCalled.current = next.ticket;
      return;
    }
    if (lastCalled.current === next.ticket) return;
    lastCalled.current = next.ticket;
    speakTicket(next.ticket, next.destinationArea);
  }, [next?.ticket, next?.destinationArea]);

  const nextLevel = next ? levelInfo(next.triageLevel) : null;

  return (
    <div className="board">
      <header className="board-head">
        <div>
          <p className="eyebrow">Urgencias · sala de espera</p>
          <h1>Se atiende primero al más grave</h1>
          <p className="lede">Su turno son las iniciales y los últimos 3 números del documento. El orden puede cambiar.</p>
        </div>
        <div className="board-clock">
          <b>{now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</b>
          <small>{now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</small>
        </div>
      </header>

      {status === "loading" && <p className="board-msg">Abriendo la sala… la primera vez puede tardar un minuto.</p>}
      {status === "waking" && <p className="board-msg">El servidor se está despertando. Reintentamos solos.</p>}
      {status === "ok" && <p className={`board-live ${live ? "on" : ""}`}>{live ? "● En vivo" : "Se actualiza sola"}</p>}

      {next && nextLevel && (
        <div className={`board-next ${nextLevel.tone}`}>
          <span>Siguiente · pase ahora</span>
          <b>{next.ticket}</b>
          <em>{next.destinationArea || "Triaje"}{next.destinationCode ? ` · ${next.destinationCode}` : ""}</em>
          <small>
            {nextLevel.chip}
            {next.estimatedWaitMinutes === 0 ? " · ya" : ` · ~${next.estimatedWaitMinutes} min`}
            {next.present === false ? " · no está en sala: acérquese a triaje" : ""}
          </small>
        </div>
      )}

      <section className="board-grid">
        <div>
          <h2>En espera ({Math.max(0, waiting.length - (next ? 1 : 0))})</h2>
          {status === "ok" && waiting.length === 0 && <p className="board-msg">No hay nadie esperando.</p>}
          <ol className="board-list">
            {rest.map((r) => {
              const level = levelInfo(r.triageLevel);
              return (
                <li key={`${r.ticket}-${r.position}`} className={`board-row ${level.tone} ${r.present === false ? "away" : ""}`}>
                  <em>{r.position}</em>
                  <strong>
                    {r.ticket}
                    {r.present === false && <small className="board-note">No está en sala · acérquese a triaje</small>}
                    {r.present !== false && r.overdue && <small className="board-note">Si se siente peor, avise en triaje</small>}
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
            <p><span className="chip i">Crítica</span> ya</p>
            <p><span className="chip ii">Alta</span> 10 min</p>
            <p><span className="chip iii">Media</span> 30 min</p>
            <p><span className="chip iv">Baja</span> 60 min</p>
            <p><span className="chip v">Mínima</span> 120 min</p>
          </div>
        </aside>
      </section>
      <footer className="board-foot">
        <a href="#/">Volver al ingreso del personal</a>
      </footer>
    </div>
  );
}
