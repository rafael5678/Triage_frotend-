import { useEffect, useMemo, useRef, useState } from "react";
import { COMORBIDITIES } from "../ml/conditions";
import { featureContributions, getModel, predictScore } from "../ml/model";
import { comparePriority, createPatient, isElderly, ticketCode } from "../models/patient";
import { explainWhy } from "../models/explain";
import {
  analyzeTriage, fetchPatients, fetchQueueHealth, fetchSymptoms, finishCare, login as loginRequest, markNotified,
  registerAndScore, reevaluatePatient, setPresence, startCare, subscribeEvents,
} from "../services/api";
import { CARE_TARGETS, estimateWaitMinutes, waitSummary } from "../models/waitTimes";
import { conditionLabel, setSymptomCatalog, symptomCatalog } from "../models/catalog";
import { AVPU } from "../models/levels";
import { isValidWhatsApp, minutesLabel, noticeDue, phoneError, waitInfo, whatsappLink } from "../models/notice";
import { crashWarning, fillRestingIfEmpty, invertedPressure, vitalHint } from "../models/vitals";
import AdminPortal from "./AdminPortal";
import AiIntake from "./AiIntake";
import FieldHelp from "./FieldHelp";
import Recommendations, { DestinationCard, EstimatedWarning, VitalGuide } from "./Recommendations";
import ShiftReport from "./ShiftReport";
import StatsView from "./StatsView";
import Timeline from "./Timeline";

const SESSION_KEY = "triage.session";

const NAV = [
  ["queue", "Sala de espera"],
  ["intake", "Ingreso"],
  ["patients", "Pacientes"],
  ["stats", "Estadísticas"],
  ["report", "Reporte del turno"],
  ["history", "Historial"],
  ["model", "Cómo calcula"],
  ["ethics", "Uso responsable"],
];

const EMPTY_FORM = {
  name: "",
  document: "",
  age: "",
  sex: "M",
  conditionId: "",
  reason: "",
  systolic: "",
  diastolic: "",
  heartRate: "",
  spo2: "",
  temperature: "",
  respiratoryRate: "",
  glucose: "",
  painScale: "",
  consciousness: "",
  comorbidityIds: [],
  estimatedFields: [],
  photo: null,
  phone: "",
  pregnant: false,
  gestationWeeks: "",
  present: true,
};

/** Insignias de tiempo y presencia que se ven en la cola. */
function WaitBadges({ patient, now }) {
  const w = waitInfo(patient, now);
  return (
    <span className="badges">
      {w.overdue && <span className="badge late">Vencido hace {minutesLabel(w.left)}</span>}
      {w.soon && <span className="badge soon">Vence en {w.left} min</span>}
      {patient.present === false && <span className="badge away">No ha llegado</span>}
      {patient.notifiedAt && <span className="badge sent">Avisado{patient.notifiedChannel === "WHATSAPP" ? " por WhatsApp" : ""}</span>}
      {patient.pregnant && <span className="badge preg">Embarazo{patient.gestationWeeks ? ` ${patient.gestationWeeks} sem` : ""}</span>}
    </span>
  );
}

function Logo() {
  return (
    <div className="brand">
      <span className="mark" aria-hidden>
        <svg viewBox="0 0 36 36">
          <path d="M3 18h7l3.2-9 4.2 18 3-9H33" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <strong>TriageIA</strong>
        <small>Cola por gravedad real</small>
      </div>
    </div>
  );
}

function Chip({ priority }) {
  return <span className={`chip ${priority.tone}`}>{priority.chip}</span>;
}

/** ask: nombre del dato para que la IA lo explique; estimated: el valor lo puso la IA y falta medirlo. */
function Field({ label, help, children, className, ask, value, context, estimated, rangeKey, age }) {
  const hint = rangeKey ? vitalHint(rangeKey, value, age) : null;
  return (
    <div className={`field ${className || ""} ${estimated ? "is-estimated" : ""}`.trim()}>
      <span className="label-row">
        {label}
        {ask && <FieldHelp field={ask} value={value} context={context} />}
        {estimated && <span className="est-badge">Estimado por IA · medir</span>}
      </span>
      {children}
      {hint && <small className={`vital-live ${hint.ok ? "ok" : "bad"}`}>{hint.text}</small>}
    </div>
  );
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const pack = useMemo(() => getModel(), []);
  const [user, setUser] = useState(readSession);
  const [login, setLogin] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [view, setView] = useState("queue");
  const [form, setForm] = useState(EMPTY_FORM);
  const [patients, setPatients] = useState([]);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [recheck, setRecheck] = useState(null);
  const [liveQueue, setLiveQueue] = useState({ loading: true, patients: [] });
  const [now, setNow] = useState(Date.now());
  const [live, setLive] = useState(false);
  const [whatsappMode, setWhatsappMode] = useState("");
  const [historyFor, setHistoryFor] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const reloadTimer = useRef(null);

  const waiting = useMemo(
    () => patients.filter((p) => p.status === "En espera").sort(comparePriority),
    [patients]
  );
  const positionOf = (id) => {
    const i = waiting.findIndex((p) => p.id === id);
    return i < 0 ? null : i + 1;
  };

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  /** Cola en vivo: el servidor avisa cuando algo cambió y aquí se vuelve a pedir la lista. */
  useEffect(() => {
    if (!user || user.role === "ADMIN") return undefined;
    const reload = () => {
      clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        fetchPatients()
          .then((list) => {
            setPatients(list);
            setSelected((current) => (current ? list.find((p) => p.id === current.id) || current : current));
            setRefreshKey((k) => k + 1);
          })
          .catch(() => {});
      }, 400);
    };
    const stop = subscribeEvents(reload, setLive);
    const fallback = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 60000);
    fetchQueueHealth().then((h) => setWhatsappMode(h?.whatsapp || "")).catch(() => {});
    return () => {
      stop();
      clearInterval(fallback);
      clearTimeout(reloadTimer.current);
    };
  }, [user]);

  useEffect(() => {
    fetchPatients()
      .then((list) => setLiveQueue({ loading: false, patients: list.filter((p) => p.status === "En espera").sort(comparePriority) }))
      .catch(() => setLiveQueue({ loading: false, patients: [], offline: true }));
  }, []);

  useEffect(() => {
    if (!user || user.role === "ADMIN") return;
    fetchSymptoms()
      .then((rows) => {
        setSymptomCatalog(rows);
        setCatalog(rows);
      })
      .catch(() => {
        setSymptomCatalog([]);
        setCatalog([]);
      });
    fetchPatients()
      .then((list) => setPatients(list))
      .catch(() => setPatients([]));
  }, [user]);

  function flash(message) {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  }

  function setField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value,
      estimatedFields: (current.estimatedFields || []).filter((f) => f !== key),
    }));
  }

  function applyForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  const caseContext = `${form.age ? `${form.age} años` : ""} ${form.sex || ""} ${conditionLabel(form.conditionId)} ${form.reason || ""}`.trim();

  function toPayload(source) {
    return {
      ...source,
      age: Number(source.age),
      spo2: Number(source.spo2),
      heartRate: Number(source.heartRate),
      systolic: Number(source.systolic),
      diastolic: Number(source.diastolic),
      temperature: Number(source.temperature),
      respiratoryRate: Number(source.respiratoryRate),
      comorbidityIds: source.comorbidityIds,
      evaluatedBy: user?.displayName || user?.username || null,
    };
  }

  async function onLogin(event) {
    event.preventDefault();
    setLoginBusy(true);
    setLoginError("");
    try {
      const session = await loginRequest(login);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setUser(session);
    } catch (error) {
      setLoginError(error.message || "Usuario o contraseña incorrectos.");
    } finally {
      setLoginBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    setUser(null);
    setPatients([]);
    setCatalog([]);
    setSymptomCatalog([]);
  }

  async function analyze(event) {
    event.preventDefault();
    if (!form.conditionId) return;
    const warn = [invertedPressure(form), crashWarning(form)].filter(Boolean).join(" ");
    if (warn && !window.confirm(`${warn}\n\n¿Calcular con estos números?`)) return;
    setAnalyzeBusy(true);
    const local = createPatient(toPayload(form), pack.model);
    local.contributions = featureContributions(pack.model, local);
    try {
      const scored = await analyzeTriage(toPayload(form), local.score);
      const patient = {
        ...local,
        ...scored,
        name: form.name,
        document: form.document,
        comorbidityIds: form.comorbidityIds,
        phone: form.phone,
        present: form.present,
        pregnant: form.sex === "F" && form.pregnant,
        gestationWeeks: form.gestationWeeks,
        evaluatedBy: local.evaluatedBy,
      };
      patient.explanation = explainWhy(patient);
      setResult(patient);
      setView("result");
    } catch (error) {
      local.explanation = explainWhy(local);
      setResult(local);
      setView("result");
      flash(`Se usó el protocolo local: ${error.message}`);
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function confirmEntry() {
    if (confirmBusy) return;
    const wa = phoneError(result.phone);
    if (String(result.phone || "").trim() && wa) {
      setConfirmError(wa);
      return;
    }
    setConfirmBusy(true);
    setConfirmError("");
    try {
      const saved = {
        ...result,
        ...(await registerAndScore(result)),
        contributions: result.contributions,
        immediateActions: result.immediateActions,
        testsToOrder: result.testsToOrder,
        monitoring: result.monitoring,
        redFlags: result.redFlags,
        geminiReasons: result.geminiReasons,
        datasetReasons: result.datasetReasons,
        iaActive: result.iaActive,
      };
      saved.explanation = explainWhy(saved);
      const nextList = [saved, ...patients.filter((p) => p.id !== saved.id)].sort(comparePriority);
      setPatients(nextList);
      setForm(EMPTY_FORM);
      const ticket = saved.ticket || ticketCode(saved);
      const place = nextList.filter((p) => p.status === "En espera").findIndex((p) => p.id === saved.id) + 1;
      flash(`${saved.name} quedó en la cola · turno ${ticket} · puesto ${place || 1}.`);
      if (isValidWhatsApp(saved.phone)) {
        const link = whatsappLink(saved, place || 1, Date.now());
        if (link) window.open(link, "_blank", "noopener");
      }
      setView("queue");
      setResult(null);
    } catch (error) {
      setConfirmError(error.message || "No se pudo guardar en la cola.");
      flash(`No se guardó en la cola: ${error.message}`);
    } finally {
      setConfirmBusy(false);
    }
  }

  function replacePatient(updated) {
    setPatients((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated, contributions: p.contributions } : p)));
    setSelected((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
  }

  async function moveToCare(id) {
    try {
      const updated = await startCare(id);
      replacePatient(updated);
      const minutes = updated.careStartedAt ? Math.round((updated.careStartedAt - updated.arrivedAt) / 60000) : null;
      flash(`Pasa a atención${minutes != null ? ` después de ${minutesLabel(minutes)} de espera` : ""}.`);
    } catch (error) {
      flash(error.message);
      return;
    }
    setSelected(null);
  }

  async function closeCare(id, status) {
    try {
      replacePatient(await finishCare(id, status));
      flash(status === "ATENDIDO" ? "Atención terminada." : "Se marcó como cancelado (se fue sin ser atendido).");
    } catch (error) {
      flash(error.message);
    }
  }

  async function togglePresence(patient) {
    try {
      const updated = await setPresence(patient.id, patient.present === false);
      replacePatient(updated);
      flash(updated.present ? `${patient.name} ya está en la sala.` : `${patient.name} quedó como "no ha llegado".`);
    } catch (error) {
      flash(error.message);
    }
  }

  /** Abre WhatsApp con el mensaje listo y deja constancia del aviso. */
  async function sendWhatsapp(patient) {
    const link = whatsappLink(patient, positionOf(patient.id), now);
    if (!link) {
      flash("Este paciente no tiene celular registrado.");
      return;
    }
    window.open(link, "_blank", "noopener");
    try {
      replacePatient(await markNotified(patient.id, "MANUAL"));
    } catch (error) {
      flash(`Se abrió WhatsApp, pero no se guardó el aviso: ${error.message}`);
    }
  }

  async function applyRecheck(event) {
    event.preventDefault();
    const before = patients.find((p) => p.id === recheck.id);
    const positionBefore = waiting.findIndex((p) => p.id === recheck.id);
    let next = createPatient(toPayload(recheck), pack.model);
    next.id = recheck.id;
    next.name = recheck.name;
    next.document = recheck.document;
    next.arrivedAt = recheck.arrivedAt;
    next.explanation = explainWhy(next);
    try {
      next = { ...next, ...(await reevaluatePatient(recheck.id, toPayload(recheck))) };
      next.explanation = explainWhy(next);
    } catch (error) {
      flash(error.message);
      return;
    }
    setRefreshKey((k) => k + 1);
    const merged = patients.map((p) => (p.id === next.id ? next : p));
    const queue = merged.filter((p) => p.status === "En espera").sort(comparePriority);
    const positionAfter = queue.findIndex((p) => p.id === next.id);
    setPatients(merged);
    setRecheck(null);
    setSelected(next);
    const delta = positionBefore - positionAfter;
    const moved = delta > 0 ? `subió ${delta} puesto(s)` : delta < 0 ? `bajó ${Math.abs(delta)} puesto(s)` : "se quedó en el mismo puesto";
    flash(`Nuevo puntaje ${before.score} → ${next.score}: ${moved}.`);
    setView("queue");
  }

  const filtered = patients.filter((p) => {
    const q = query.toLowerCase();
    return !q || (p.name || "").toLowerCase().includes(q) || String(p.document || "").includes(q);
  });

  const topWaiting = liveQueue.patients[0];
  const selectedExplain = selected ? explainWhy(selected) : null;
  const conditions = catalog.length ? catalog : symptomCatalog();

  if (!user) {
    return (
      <div className="auth">
        <section className="auth-copy">
          <Logo />
          <p className="eyebrow">Urgencias · cola por riesgo, no por orden de llegada</p>
          <h1>Entra quien está más grave, no quien llegó primero.</h1>
          <p className="lede">
            El puntaje va de 0 a 100. Se calcula con oxígeno, pulso, presión, temperatura, respiración, edad, qué le duele y enfermedades que ya tenía.
          </p>
          <form className="auth-form" onSubmit={onLogin}>
            <label>Usuario<input autoComplete="username" value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} /></label>
            <label>Contraseña<input type="password" autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>
            {loginError && <p className="form-err">{loginError}</p>}
            <button className="btn" type="submit" disabled={loginBusy}>{loginBusy ? "Comprobando…" : "Entrar"}</button>
          </form>
          <p className="board-link"><a href="#/sala">Abrir la pantalla de la sala de espera (para el televisor)</a></p>
        </section>
        <aside className="auth-visual">
          <div className="glass glass-wide">
            <span>Cuánto se espera, según qué tan grave esté</span>
            <p className="glass-lead">
              El puntaje va de 0 a 100: <b>más alto = más grave</b>. 62 es Alta; 8 es Mínima.
              La barra es la espera en minutos (un caso leve puede esperar más).
            </p>
            <ul className="wait-bands">
              {CARE_TARGETS.map((t) => {
                const count = liveQueue.patients.filter((p) => p.score >= t.minScore && p.score <= t.maxScore).length;
                const share = Math.round((t.wait / 120) * 100);
                return (
                  <li key={t.id}>
                    <div className="wait-row">
                      <b>{t.label}</b>
                      <em>puntaje {t.minScore}–{t.maxScore}</em>
                      <span>~{t.wait} min</span>
                    </div>
                    <div className="wait-bar"><i style={{ width: `${share}%` }} /></div>
                    <small>{t.detail}{!liveQueue.loading && !liveQueue.offline ? ` · Ahora en sala: ${count}` : ""}</small>
                  </li>
                );
              })}
            </ul>
            {topWaiting && (
              <p className="glass-now">
                Más grave ahora: puntaje {topWaiting.score.toFixed(1)} · espera meta ~{estimateWaitMinutes(topWaiting.score, liveQueue.patients)} min.
              </p>
            )}
            {liveQueue.loading && <small className="glass-status">Consultando la sala… si el servidor está dormido puede tardar hasta un minuto.</small>}
            {liveQueue.offline && <small className="glass-status">Servidor aún no responde. Puedes entrar igual; la tabla de espera es del protocolo de triage.</small>}
            {!liveQueue.loading && !liveQueue.offline && !topWaiting && (
              <small className="glass-status">Sala vacía en la base. Los tiempos de arriba son la meta según gravedad.</small>
            )}
          </div>
        </aside>
      </div>
    );
  }

  if (user.role === "ADMIN") {
    return <AdminPortal user={user} onLogout={logout} />;
  }

  return (
    <div className="app">
      <aside className="side">
        <Logo />
        <nav>
          {NAV.map(([id, label]) => (
            <button key={id} className={view === id || (id === "intake" && view === "result") ? "on" : ""} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="me">
          <span className="ava">UR</span>
          <div>
            <b>{user.displayName}</b>
            <small>Personal de urgencias</small>
          </div>
        </div>
      </aside>

      <div className="stage">
        <header className="bar">
          <input placeholder="Buscar por nombre o documento…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="bar-meta">
            <span className={`live ${live ? "on" : "off"}`} title={live ? "La cola se actualiza sola cuando algo cambia" : "Sin conexión en vivo: se actualiza cada minuto"}>
              {waiting.length} en espera · {live ? "en vivo" : "cada minuto"}
            </span>
            <button className="text" onClick={logout}>Salir</button>
          </div>
        </header>
        {toast && <div className="toast">{toast}</div>}

        {view === "queue" && (
          <section className="page">
            <div className="hero-line">
              <div>
                <h1>Sala de espera</h1>
                <p>El 1 es el más grave. Si el nivel es el mismo, pasa quien tiene 65 años o más. El turno (JC-478) es el de la pantalla de sala.</p>
              </div>
              <button className="btn" onClick={() => setView("intake")}>Nuevo ingreso</button>
            </div>
            <div className="stats">
              <article><small>En espera</small><b>{waiting.length}</b></article>
              <article className="crit"><small>Puntaje 62 o más</small><b>{waiting.filter((p) => p.score >= 62).length}</b></article>
              <article className={waiting.some((p) => waitInfo(p, now).overdue) ? "crit" : ""}>
                <small>Pasaron su tiempo máximo</small><b>{waiting.filter((p) => waitInfo(p, now).overdue).length}</b>
              </article>
              <article><small>No han llegado</small><b>{waiting.filter((p) => p.present === false).length}</b></article>
              <article><small>En atención</small><b>{patients.filter((p) => p.status === "En atención").length}</b></article>
            </div>
            {waiting.some((p, i) => noticeDue(p, i + 1, now) && p.phone) && (
              <div className="notice-bar">
                <b>Avisar por WhatsApp:</b>{" "}
                {waiting.map((p, i) => ({ p, pos: i + 1 })).filter(({ p, pos }) => noticeDue(p, pos, now) && p.phone).map(({ p }) => (
                  <button key={p.id} className="text" onClick={() => sendWhatsapp(p)}>{p.name}</button>
                ))}
                <small>{whatsappMode === "automatico"
                  ? " El servidor también los avisa solo; el botón es por si no llega."
                  : " El aviso automático no está configurado: toque el nombre para abrir WhatsApp con el mensaje listo."}</small>
              </div>
            )}
            <div className="split">
              <ol className="queue">
                {waiting.length === 0 && <li className="empty">No hay pacientes en espera en la base de datos.</li>}
                {waiting.map((p, i) => (
                  <li key={p.id} className={`q ${p.priority.tone} ${selected?.id === p.id ? "sel" : ""} ${waitInfo(p, now).overdue ? "overdue" : ""} ${p.present === false ? "away" : ""}`} onClick={() => setSelected(p)}>
                    <em>{String(i + 1).padStart(2, "0")}</em>
                    <div>
                      <strong>
                        {p.name}
                        {isElderly(p) && <span className="elder">65+</span>}
                      </strong>
                      <small>
                        <b className="ticket">{p.ticket || ticketCode(p)}</b>
                        {" · "}{conditionLabel(p.conditionId)}
                        {" · llegó "}{new Date(p.arrivedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        {" · lleva "}{minutesLabel(waitInfo(p, now).waited)}
                      </small>
                      <WaitBadges patient={p} now={now} />
                    </div>
                    <Chip priority={p.priority} />
                    <div className="sc">
                      <b>{Number(p.score).toFixed(1)}</b>
                      <small>meta {p.maxWaitMinutes ?? estimateWaitMinutes(p.score, waiting)} min</small>
                    </div>
                    <span className="wait">~{p.maxWaitMinutes ?? estimateWaitMinutes(p.score, waiting)} min</span>
                  </li>
                ))}
              </ol>
              <aside className="dossier">
                {!selected && <p className="muted">Toca un paciente para ver por qué tiene ese puntaje.</p>}
                {selected && selectedExplain && (
                  <>
                    <Chip priority={selected.priority} />
                    <p className="ticket-xl">{selected.ticket || ticketCode(selected)}</p>
                    <h2>{selected.name}{isElderly(selected) && <span className="elder">65+</span>}</h2>
                    <p className="muted">{selectedExplain.meaning}</p>
                    <p className="scoreline">Puntaje <b>{Number(selected.score).toFixed(1)}</b> / 100</p>
                    <p className="muted">{waitSummary(selected.score, waiting).text}</p>
                    <DestinationCard patient={selected} compact />
                    <EstimatedWarning fields={selected.estimatedFields} />
                    {selected.immediateActions?.length > 0 && (
                      <>
                        <h4 className="mini-title">Hacer ya</h4>
                        <ul className="why-list">{selected.immediateActions.slice(0, 3).map((a) => <li key={a}>{a}</li>)}</ul>
                      </>
                    )}
                    <h4 className="mini-title">Por qué</h4>
                    <ul className="why-list">
                      {selectedExplain.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}
                    </ul>
                    {selected.status === "En espera" && (
                      <div className="care-meta">
                        <WaitBadges patient={selected} now={now} />
                        <p className="muted">
                          Llegó a las {new Date(selected.arrivedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} · lleva {minutesLabel(waitInfo(selected, now).waited)} · meta {waitInfo(selected, now).max} min
                          {selected.evaluatedBy ? ` · signos: ${selected.evaluatedBy}` : ""}
                        </p>
                        <div className="row-btns">
                          <button className="ghost" onClick={() => togglePresence(selected)}>
                            {selected.present === false ? "Ya llegó a la sala" : "No está en la sala"}
                          </button>
                          {selected.phone ? (
                            <button className="ghost wa" onClick={() => sendWhatsapp(selected)}>
                              {selected.notifiedAt ? "Avisar otra vez por WhatsApp" : "Avisar por WhatsApp"}
                            </button>
                          ) : <small className="muted">Sin celular: no se le puede avisar.</small>}
                        </div>
                      </div>
                    )}
                    <div className="row-btns">
                      <button className="btn" onClick={() => moveToCare(selected.id)}>Pasar a atención</button>
                      <button className="ghost" onClick={() => { setRecheck({ ...selected, estimatedFields: [] }); setView("recheck"); }}>Volver a medir signos</button>
                    </div>
                    <h4 className="mini-title">Evolución</h4>
                    <Timeline patientId={selected.id} refreshKey={refreshKey} />
                  </>
                )}
              </aside>
            </div>
          </section>
        )}

        {view === "intake" && (
          <section className="page">
            <h1>Nuevo ingreso</h1>
            <p className="sub">1. Cuente qué pasa. 2. Pulse Llenar con IA. 3. Revise los números y calcule. El ? explica cualquier casilla.</p>
            <form className="sheet intake-sheet" onSubmit={analyze}>
              <AiIntake form={form} onApply={applyForm} comorbidities={COMORBIDITIES} flash={flash} />

              <h3>Paciente</h3>
              <div className="g2">
                <Field label="Nombre">
                  <input required placeholder="Nombre y apellido" value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </Field>
                <Field label="Documento">
                  <input required placeholder="Cédula o TI" value={form.document} onChange={(e) => setField("document", e.target.value)} />
                </Field>
                <Field className="full" label="WhatsApp (celular colombiano)">
                  <input type="tel" inputMode="tel" maxLength={20} placeholder="300 123 4567" value={form.phone} onChange={(e) => setField("phone", e.target.value)} />
                  <small className={phoneError(form.phone) ? "vital-live bad" : "hint"}>
                    {phoneError(form.phone) || "Solo un celular real de Colombia (10 dígitos, empieza en 3). Al confirmar se manda el turno por WhatsApp."}
                  </small>
                </Field>
                <Field label="Edad">
                  <input required type="number" min="0" max="120" value={form.age} onChange={(e) => setField("age", e.target.value)} />
                </Field>
                <Field label="Sexo">
                  <select value={form.sex} onChange={(e) => setField("sex", e.target.value)}>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="O">Otro / no dice</option>
                  </select>
                </Field>
                {form.sex === "F" && Number(form.age) >= 10 && Number(form.age) <= 55 && (
                  <>
                    <Field label="¿Embarazo?">
                      <select value={form.pregnant ? "si" : "no"} onChange={(e) => setField("pregnant", e.target.value === "si")}>
                        <option value="no">No / no sabe</option>
                        <option value="si">Sí</option>
                      </select>
                    </Field>
                    {form.pregnant && (
                      <Field label="Semanas">
                        <input type="number" min="1" max="45" value={form.gestationWeeks} onChange={(e) => setField("gestationWeeks", e.target.value)} />
                      </Field>
                    )}
                  </>
                )}
                <Field className="full" label="Qué le pasa">
                  <select required value={form.conditionId} onChange={(e) => setField("conditionId", e.target.value)}>
                    <option value="">La IA lo sugiere, o elija aquí…</option>
                    {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>

              <h3>Signos (se miden, no se adivinan)</h3>
              <p className="sub">
                Oxígeno: clip en el dedo. Pulso: el mismo clip o la muñeca. Presión: tensiómetro (el de arriba / el de abajo).
                Temperatura: frente o axila. Respiración: cuente el pecho 1 minuto.
                Si está ensayando y no tiene aparatos, use reposo para la edad que escribió.
              </p>
              <button type="button" className="ghost" onClick={() => applyForm(fillRestingIfEmpty(form))}>
                Usar signos de reposo para esta edad (ensayo)
              </button>
              <div className="g3 vitals-grid">
                <Field label="Oxígeno %" rangeKey="spo2" age={form.age} ask="Saturación de oxígeno (SpO2, %)" value={form.spo2} context={caseContext} estimated={form.estimatedFields.includes("spo2")}>
                  <input required type="number" min="50" max="100" placeholder="95–100" value={form.spo2} onChange={(e) => setField("spo2", e.target.value)} />
                </Field>
                <Field label="Pulso" rangeKey="heartRate" age={form.age} ask="Frecuencia cardiaca (latidos por minuto)" value={form.heartRate} context={caseContext} estimated={form.estimatedFields.includes("heartRate")}>
                  <input required type="number" min="20" max="220" placeholder="60–100" value={form.heartRate} onChange={(e) => setField("heartRate", e.target.value)} />
                </Field>
                <Field label="PA arriba" rangeKey="systolic" age={form.age} ask="Presión arterial sistólica (mmHg)" value={form.systolic} context={caseContext} estimated={form.estimatedFields.includes("systolic")}>
                  <input required type="number" min="50" max="250" placeholder="120" value={form.systolic} onChange={(e) => setField("systolic", e.target.value)} />
                </Field>
                <Field label="PA abajo" rangeKey="diastolic" age={form.age} ask="Presión arterial diastólica (mmHg)" value={form.diastolic} context={caseContext} estimated={form.estimatedFields.includes("diastolic")}>
                  <input required type="number" min="20" max="160" placeholder="80" value={form.diastolic} onChange={(e) => setField("diastolic", e.target.value)} />
                </Field>
                <Field label="Temp. °C" rangeKey="temperature" age={form.age} ask="Temperatura corporal (°C)" value={form.temperature} context={caseContext} estimated={form.estimatedFields.includes("temperature")}>
                  <input required type="number" step="0.1" min="32" max="43" placeholder="36.5" value={form.temperature} onChange={(e) => setField("temperature", e.target.value)} />
                </Field>
                <Field label="Respiración" rangeKey="respiratoryRate" age={form.age} ask="Frecuencia respiratoria (respiraciones por minuto)" value={form.respiratoryRate} context={caseContext} estimated={form.estimatedFields.includes("respiratoryRate")}>
                  <input required type="number" min="4" max="50" placeholder="12–20" value={form.respiratoryRate} onChange={(e) => setField("respiratoryRate", e.target.value)} />
                </Field>
              </div>

              <details className="more-box">
                <summary>Más datos opcionales (glucosa, dolor, enfermedades)</summary>
                <div className="g3" style={{ marginTop: 12 }}>
                  <Field label="¿Ya está en sala?">
                    <select value={form.present ? "si" : "no"} onChange={(e) => setField("present", e.target.value === "si")}>
                      <option value="si">Sí</option>
                      <option value="no">Aún no llega</option>
                    </select>
                  </Field>
                  <Field label="Glucosa" ask="Glucosa en sangre (glucometría, mg/dL)" value={form.glucose} context={caseContext}>
                    <input type="number" min="10" max="1500" value={form.glucose} onChange={(e) => setField("glucose", e.target.value)} />
                  </Field>
                  <Field label="Dolor 0–10" ask="Escala de dolor de 0 a 10" value={form.painScale} context={caseContext}>
                    <input type="number" min="0" max="10" value={form.painScale} onChange={(e) => setField("painScale", e.target.value)} />
                  </Field>
                  <Field label="Conciencia" ask="Estado de conciencia (escala AVPU)" value={form.consciousness} context={caseContext}>
                    <select value={form.consciousness} onChange={(e) => setField("consciousness", e.target.value)}>
                      {AVPU.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field className="full" label="Detalle (opcional)">
                    <textarea rows="2" placeholder="Desde cuándo, si empeoró…" value={form.reason} onChange={(e) => setField("reason", e.target.value)} />
                  </Field>
                </div>
                <div className="checks">
                  {COMORBIDITIES.map((c) => (
                    <label key={c.id} className="chk">
                      <input
                        type="checkbox"
                        checked={form.comorbidityIds.includes(c.id)}
                        onChange={() =>
                          setField(
                            "comorbidityIds",
                            form.comorbidityIds.includes(c.id)
                              ? form.comorbidityIds.filter((x) => x !== c.id)
                              : [...form.comorbidityIds, c.id]
                          )
                        }
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
              </details>
              <button className="btn wide" type="submit" disabled={analyzeBusy}>{analyzeBusy ? "Calculando con el protocolo y Gemini…" : "Calcular puntaje"}</button>
            </form>
          </section>
        )}

        {view === "result" && result && (
          <section className="page">
            <h1>Por qué salió este puntaje</h1>
            <p className="sub">
              El puntaje es de gravedad: <b>100 es lo más urgente, 0 es lo más leve</b>.
              62 es Alta; 8 es Mínima. No está al revés. Gemini no puede bajar un caso grave.
            </p>
            {crashWarning(result) && <p className="warn-line">{crashWarning(result)}</p>}
            <div className={`banner ${result.priority.tone}`}>
              <div className={`severity-stamp ${result.priority.tone}`}>
                {result.priority.chip}
              </div>
              <div className="banner-copy">
                <p className="severity-kicker">{result.priority.esi} · {result.priority.name}</p>
                <p className="ticket-xl">{result.ticket || ticketCode(result)}</p>
                <h2>{result.score.toFixed(1)} <span>/ 100 de gravedad</span></h2>
                <p className="danger-lead">{result.explanation.dangerLead}</p>
                <p>{result.explanation.meaning}</p>
                <p>{result.explanation.whyQueue}</p>
                <p>{waitSummary(result.score, waiting).text}</p>
              </div>
              <DestinationCard patient={result} />
            </div>
            <EstimatedWarning fields={result.estimatedFields} />
            <VitalGuide patient={result} />
            <Recommendations patient={result} />
            <div className="split">
              <div className="sheet">
                <h3>Dataset del hospital</h3>
                {result.protocolScore != null && <p className="muted">Puntaje del protocolo: {Number(result.protocolScore).toFixed(1)}</p>}
                <ul className="why-list big">
                  {(result.datasetReasons?.length ? result.datasetReasons : result.explanation.reasons.slice(0, 3)).map((r) => <li key={r}>{r}</li>)}
                </ul>
              </div>
              <div className="sheet">
                <h3>Criterio de Gemini</h3>
                {result.iaActive && result.geminiScore != null && <p className="muted">Puntaje que sugiere la IA: {Number(result.geminiScore).toFixed(1)}</p>}
                {!result.iaActive && <p className="muted">Gemini no respondió esta vez (puede estar saturado). Se usó solo el protocolo; puede volver a calcular en un momento.</p>}
                <ul className="why-list big">
                  {(result.geminiReasons || []).map((r) => <li key={r}>{r}</li>)}
                </ul>
                {(result.contributions || []).filter((f) => Math.abs(f.weight) >= 0.5).slice(0, 4).map((f) => (
                  <div key={f.id} className="barline">
                    <span>{f.name}</span>
                    <i><b style={{ width: `${Math.min(100, Math.abs(f.weight) * 8)}%` }} /></i>
                    <em>{f.weight > 0 ? "+" : ""}{f.weight}</em>
                  </div>
                ))}
              </div>
            </div>
            <div className="sheet wa-box">
              <h3>Avisar el turno por WhatsApp</h3>
              <p className="muted">Celular colombiano real. Al confirmar se abre WhatsApp con el turno {result.ticket || ticketCode(result)}, el puesto y el área.</p>
              <Field label="Celular">
                <input type="tel" inputMode="tel" maxLength={20} placeholder="318 668 0042" value={result.phone || ""} onChange={(e) => {
                  setConfirmError("");
                  setResult({ ...result, phone: e.target.value });
                }} />
              </Field>
              {isValidWhatsApp(result.phone) && <p className="hint">Este celular sí sirve. Al confirmar se abre WhatsApp con el turno.</p>}
              {phoneError(result.phone) && <p className="form-err">{phoneError(result.phone)}</p>}
              {!String(result.phone || "").trim() && <p className="warn-line">Sin un celular válido no le llega el mensaje. Puede confirmar igual y avisar después.</p>}
            </div>
            {confirmError && <p className="form-err">{confirmError}</p>}
            <div className="row-btns" style={{ marginTop: 16 }}>
              <button className="btn" onClick={confirmEntry} disabled={confirmBusy}>
                {confirmBusy ? "Guardando en la cola…" : "Confirmar y poner en la cola"}
              </button>
              <button className="ghost" onClick={() => setView("intake")} disabled={confirmBusy}>Corregir datos</button>
            </div>
          </section>
        )}

        {view === "recheck" && recheck && (
          <section className="page">
            <h1>Volver a medir</h1>
            <p className="sub">Si los números empeoran, el puntaje sube y puede adelantar en la cola. Puntaje actual: {predictScore(pack.model, toPayload(recheck)).toFixed(1)}.</p>
            <form className="sheet" onSubmit={applyRecheck}>
              <p><b>{recheck.name}</b></p>
              <div className="g3">
                <Field label="Oxígeno %"><input type="number" value={recheck.spo2} onChange={(e) => setRecheck({ ...recheck, spo2: e.target.value })} /></Field>
                <Field label="Latidos"><input type="number" value={recheck.heartRate} onChange={(e) => setRecheck({ ...recheck, heartRate: e.target.value, fc: e.target.value })} /></Field>
                <Field label="Presión arriba"><input type="number" value={recheck.systolic} onChange={(e) => setRecheck({ ...recheck, systolic: e.target.value, pas: e.target.value })} /></Field>
                <Field label="Presión abajo"><input type="number" value={recheck.diastolic} onChange={(e) => setRecheck({ ...recheck, diastolic: e.target.value, pad: e.target.value })} /></Field>
                <Field label="Temperatura"><input type="number" step="0.1" value={recheck.temperature} onChange={(e) => setRecheck({ ...recheck, temperature: e.target.value, temp: e.target.value })} /></Field>
                <Field label="Respiraciones"><input type="number" value={recheck.respiratoryRate} onChange={(e) => setRecheck({ ...recheck, respiratoryRate: e.target.value, fr: e.target.value })} /></Field>
                <Field label="Glucosa (mg/dL)"><input type="number" min="10" max="1500" value={recheck.glucose ?? ""} onChange={(e) => setRecheck({ ...recheck, glucose: e.target.value })} /></Field>
                <Field label="Dolor 0 a 10"><input type="number" min="0" max="10" value={recheck.painScale ?? ""} onChange={(e) => setRecheck({ ...recheck, painScale: e.target.value })} /></Field>
                <Field label="Conciencia">
                  <select value={recheck.consciousness || ""} onChange={(e) => setRecheck({ ...recheck, consciousness: e.target.value })}>
                    {AVPU.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
              <button className="btn" type="submit">Recalcular y reordenar</button>
            </form>
          </section>
        )}

        {view === "patients" && (
          <section className="page">
            <h1>Pacientes (base de datos)</h1>
            <div className="sheet table-wrap">
              {filtered.length === 0 && <p className="muted">No hay registros todavía.</p>}
              <table>
                <thead><tr><th>Persona</th><th>Qué le pasa</th><th>Puntaje</th><th>Prioridad</th><th>Área</th><th>Estado</th><th></th></tr></thead>
                <tbody>
                  {filtered.sort(comparePriority).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <b>{p.name}</b>
                        {isElderly(p) && <span className="elder">65+</span>}
                        <div className="muted">{p.ticket || ticketCode(p)} · {p.age} años · {p.document}{p.phone ? ` · ${p.phone}` : ""}</div>
                      </td>
                      <td>{conditionLabel(p.conditionId)}</td>
                      <td>{Number(p.score).toFixed(1)}</td>
                      <td><Chip priority={p.priority} /></td>
                      <td>{p.destinationArea || "—"}{p.destinationCode && <div className="muted">{p.destinationCode}</div>}</td>
                      <td>
                        {p.status}
                        {p.status === "En espera" && <WaitBadges patient={p} now={now} />}
                        {p.careStartedAt && <div className="muted">atendido tras {minutesLabel(Math.round((p.careStartedAt - p.arrivedAt) / 60000))}</div>}
                      </td>
                      <td className="row-btns">
                        {p.status === "En atención" && <button className="ghost" onClick={() => closeCare(p.id, "ATENDIDO")}>Terminar atención</button>}
                        {p.status === "En espera" && <button className="text" onClick={() => closeCare(p.id, "CANCELADO")}>Se fue</button>}
                        <button className="text" onClick={() => { setHistoryFor(p); setView("history"); }}>Evolución</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "stats" && <StatsView conditionLabel={conditionLabel} />}

        {view === "report" && <ShiftReport patients={patients} conditionLabel={conditionLabel} user={user} />}

        {view === "history" && (
          <section className="page">
            <h1>Historial</h1>
            <p className="sub">Cada vez que se toman los signos queda guardado: quién los tomó, cómo cambió el puntaje y cuándo pasó a atención.</p>
            <div className="split">
              <div className="sheet table-wrap">
                <table>
                  <thead><tr><th>Persona</th><th>Llegó</th><th>Prioridad</th><th>NEWS2</th><th>Estado</th></tr></thead>
                  <tbody>
                    {filtered.slice().sort((a, b) => b.evaluatedAt - a.evaluatedAt).map((p) => (
                      <tr key={p.id} className={`clickable ${historyFor?.id === p.id ? "sel" : ""}`} onClick={() => setHistoryFor(p)}>
                        <td><b>{p.name}</b><div className="muted">{p.document}</div></td>
                        <td>{new Date(p.arrivedAt).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                        <td><Chip priority={p.priority} /></td>
                        <td>{p.news2 ?? "—"}</td>
                        <td>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <aside className="sheet">
                {!historyFor && <p className="muted">Toque un paciente para ver su evolución.</p>}
                {historyFor && (
                  <>
                    <h3>{historyFor.name}</h3>
                    <p className="muted">{historyFor.age} años · {conditionLabel(historyFor.conditionId)}{historyFor.pregnant ? ` · embarazo${historyFor.gestationWeeks ? ` de ${historyFor.gestationWeeks} semanas` : ""}` : ""}</p>
                    <Timeline patientId={historyFor.id} refreshKey={refreshKey} />
                  </>
                )}
              </aside>
            </div>
          </section>
        )}

        {view === "model" && (
          <section className="page">
            <h1>Cómo se calcula</h1>
            <p className="sub">
              El puntaje de la cola sale del protocolo (NEWS2, signos, motivo y enfermedades) y, si hay llave configurada, Gemini puede subir un poco el riesgo si el relato clínico lo justifica. Nunca lo baja si los signos ya están graves.
              El gráfico de abajo es el modelo local de práctica ({pack.train.length} ejemplos; error medio {pack.metrics.mae} puntos).
            </p>
            <div className="split">
              <div className="sheet">
                <h3>Qué datos usa más el modelo</h3>
                {pack.importance.map((f) => (
                  <div key={f.feature} className="barline">
                    <span>{f.feature}</span>
                    <i><b style={{ width: `${f.percent}%` }} /></i>
                    <em>{f.percent}%</em>
                  </div>
                ))}
              </div>
              <div className="sheet">
                <h3>Quién pasa primero</h3>
                <ol className="steps">
                  <li>Se leen oxígeno, pulso, presión, temperatura, respiración, edad, motivo y enfermedades previas.</li>
                  <li>Sale un puntaje de 0 (más estable) a 100 (más grave).</li>
                  <li>La lista se ordena por gravedad (nivel de triaje y puntaje). Si el nivel es el mismo, pasa quien tiene 65 años o más. Si aún empatan, gana quien llegó antes. Un joven más grave siempre va delante de un adulto mayor más estable.</li>
                  <li>Si se vuelven a tomar los signos y empeoran, el puntaje sube y puede adelantar.</li>
                  <li>La conciencia (AVPU) suma en NEWS2. Si no responde o solo responde al dolor, sube a crítica. La glucosa por debajo de 54 o por encima de 600 también sube el piso.</li>
                  <li>Según el nivel se elige el área: reanimación, urgencias críticas, urgencias generales, consulta prioritaria o consulta externa. El dolor de pecho, el derrame, el trauma o la sepsis activan su código, y a los menores de 14 se les marca pediatría.</li>
                  <li>En menores de 16 años el pulso, la respiración y la presión se comparan con lo normal para su edad (un bebé con 140 latidos está bien; un adulto no).</li>
                  <li>En una embarazada, una presión de 140/90 ya es alerta y de 160/110 es grave: se activa el código preeclampsia. El sangrado activa el código rojo obstétrico y la convulsión, el código eclampsia.</li>
                  <li>La espera se cuenta desde que llegó, aunque lo vuelvan a medir. Si pasa su tiempo máximo, la cola lo marca como vencido.</li>
                  <li>Si quedan 10 minutos o menos, o si está entre los 2 primeros, se le avisa por WhatsApp una sola vez.</li>
                </ol>
              </div>
            </div>
          </section>
        )}

        {view === "ethics" && (
          <section className="page">
            <h1>Uso responsable</h1>
            <div className="sheet">
              <ul className="bullets">
                <li>Esto ayuda a ordenar la cola. No reemplaza al médico ni a la enfermería.</li>
                <li>Si el oxígeno, la presión o la respiración están muy mal, el sistema sube el puntaje a propósito.</li>
                <li>Los pacientes de la sala salen de la base PostgreSQL (Supabase). No se muestran nombres inventados.</li>
                <li>La IA no decide sola: el protocolo de signos vitales manda. Un clínico confirma.</li>
                <li>Si la IA estima un signo vital que nadie midió, queda marcado como estimado en el ingreso, en la cola y en la base. Hay que medirlo y recalcular.</li>
                <li>Las fotos solo se envían a la IA para el análisis. No se guardan en la base; solo se guarda lo que la IA describió.</li>
                <li>La pantalla pública de la sala no muestra nombres: solo iniciales y los últimos 3 números del documento.</li>
              </ul>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
