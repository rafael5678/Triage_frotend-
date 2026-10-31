import { useEffect, useState } from "react";
import { setPresence } from "../services/api";
import { ticketCode } from "../models/patient";

function patientIdFromLocation() {
  const path = window.location.pathname.match(/\/llegue\/([0-9a-fA-F-]{36})/);
  if (path) return path[1];
  const hash = window.location.hash.match(/llegue\/([0-9a-fA-F-]{36})/);
  return hash ? hash[1] : "";
}

/** Página que abre el paciente desde WhatsApp: un toque y el personal ve que ya está en sala. */
export default function Arrive() {
  const id = patientIdFromLocation();
  const [status, setStatus] = useState(id ? "ready" : "bad");
  const [ticket, setTicket] = useState("");

  async function confirm() {
    if (!id || status === "busy") return;
    setStatus("busy");
    try {
      const saved = await setPresence(id, true);
      setTicket(saved.ticket || ticketCode(saved));
      setStatus("ok");
    } catch (error) {
      setStatus("error");
      setTicket(error.message || "No se pudo avisar.");
    }
  }

  useEffect(() => {
    document.title = "Ya llegué · TriageIA";
  }, []);

  return (
    <div className="arrive">
      <p className="eyebrow">Urgencias</p>
      {status === "bad" && <p>Este enlace no es válido. Pida uno nuevo en triaje.</p>}
      {status === "ready" && (
        <>
          <h1>¿Ya está en la sala?</h1>
          <p>Toque el botón. El personal verá que ya llegó y puede llamarlo en la pantalla.</p>
          <button className="btn wide" onClick={confirm}>Ya llegué</button>
        </>
      )}
      {status === "busy" && <p>Avisando a la sala…</p>}
      {status === "ok" && (
        <>
          <h1>Listo</h1>
          <p>Ya figura en sala{ticket ? ` · turno ${ticket}` : ""}.</p>
          <p>Mire la pantalla grande: cuando salga su turno, pase.</p>
        </>
      )}
      {status === "error" && (
        <>
          <h1>No se pudo avisar</h1>
          <p>{ticket}</p>
          <button className="btn" onClick={() => setStatus("ready")}>Reintentar</button>
        </>
      )}
    </div>
  );
}
