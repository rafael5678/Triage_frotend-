import { useEffect, useMemo, useState } from "react";
import { COMORBIDITIES } from "../ml/conditions";
import { featureContributions, getModel, predictScore } from "../ml/model";
import { comparePriority, createPatient } from "../models/patient";
import { explainWhy } from "../models/explain";
import { analyzeTriage, fetchPatients, fetchSymptoms, login as loginRequest, registerAndScore, reevaluatePatient, startCare } from "../services/api";
import { CARE_TARGETS, estimateWaitMinutes, waitSharePercent, waitSummary } from "../models/waitTimes";
import { conditionLabel, setSymptomCatalog, symptomCatalog } from "../models/catalog";
import { AVPU } from "../models/levels";
import AdminPortal from "./AdminPortal";
import AiIntake from "./AiIntake";
import FieldHelp from "./FieldHelp";
import Recommendations, { DestinationCard, EstimatedWarning } from "./Recommendations";
import StatsView from "./StatsView";

const SESSION_KEY = "triage.session";

const NAV = [
  ["queue", "Sala de espera"],
  ["intake", "Nuevo ingreso"],
  ["patients", "Pacientes"],
  ["stats", "Estadísticas"],
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
};

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
function Field({ label, help, children, className, ask, value, context, estimated }) {
  return (
    <div className={`field ${className || ""} ${estimated ? "is-estimated" : ""}`.trim()}>
      <span className="label-row">
        {label}
        {ask && <FieldHelp field={ask} value={value} context={context} />}
        {estimated && <span className="est-badge">Estimado por IA · medir</span>}
      </span>
      {children}
      {help && <small className="field-help">{help}</small>}
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

  const waiting = useMemo(
    () => patients.filter((p) => p.status === "En espera").sort(comparePriority),
    [patients]
  );

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
    setAnalyzeBusy(true);
    const local = createPatient(toPayload(form), pack.model);
    local.contributions = featureContributions(pack.model, local);
    try {
      const scored = await analyzeTriage(toPayload(form), local.score);
      const patient = { ...local, ...scored, name: form.name, document: form.document, comorbidityIds: form.comorbidityIds };
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
    try {
      const saved = await registerAndScore(result);
      saved.contributions = result.contributions;
      saved.explanation = explainWhy(saved);
      setPatients((list) => [saved, ...list.filter((p) => p.id !== saved.id)].sort(comparePriority));
      setForm(EMPTY_FORM);
      flash(`${saved.name} quedó en la cola con puntaje ${saved.score}.`);
    } catch (error) {
      flash(`No se guardó en la base: ${error.message}`);
      return;
    }
    setView("queue");
    setResult(null);
  }

  async function moveToCare(id) {
    try {
      await startCare(id);
    } catch (error) {
      flash(error.message);
      return;
    }
    setPatients((list) => list.map((p) => (p.id === id ? { ...p, status: "En atención" } : p)));
    flash("Salió de la cola: pasa a atención.");
    setSelected(null);
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
              El puntaje 100 es lo más grave (casi no espera). El 0 es lo más leve (puede esperar más).
              La barra es el <b>porcentaje de espera</b> respecto a 2 horas: si estás muy herido, el porcentaje es bajo.
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
                Más grave ahora: puntaje {topWaiting.score.toFixed(1)} · espera meta ~{estimateWaitMinutes(topWaiting.score, liveQueue.patients)} min
                ({waitSharePercent(topWaiting.score)}% de una espera larga).
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
            <span className="live">{waiting.length} en espera (datos de la base)</span>
            <button className="text" onClick={logout}>Salir</button>
          </div>
        </header>
        {toast && <div className="toast">{toast}</div>}

        {view === "queue" && (
          <section className="page">
            <div className="hero-line">
              <div>
                <h1>Sala de espera</h1>
                <p>El número 1 es quien tiene el puntaje más alto ahora. No es el que llegó primero.</p>
              </div>
              <button className="btn" onClick={() => setView("intake")}>Nuevo ingreso</button>
            </div>
            <div className="stats">
              <article><small>En espera</small><b>{waiting.length}</b></article>
              <article className="crit"><small>Puntaje 62 o más</small><b>{waiting.filter((p) => p.score >= 62).length}</b></article>
              <article><small>Puntaje medio</small><b>{waiting.length ? (waiting.reduce((a, p) => a + p.score, 0) / waiting.length).toFixed(1) : "—"}</b></article>
              <article><small>En atención</small><b>{patients.filter((p) => p.status === "En atención").length}</b></article>
            </div>
            <div className="split">
              <ol className="queue">
                {waiting.length === 0 && <li className="empty">No hay pacientes en espera en la base de datos.</li>}
                {waiting.map((p, i) => (
                  <li key={p.id} className={`q ${p.priority.tone} ${selected?.id === p.id ? "sel" : ""}`} onClick={() => setSelected(p)}>
                    <em>{String(i + 1).padStart(2, "0")}</em>
                    <div>
                      <strong>{p.name}</strong>
                      <small>{conditionLabel(p.conditionId)}</small>
                    </div>
                    <Chip priority={p.priority} />
                    <div className="sc">
                      <b>{Number(p.score).toFixed(1)}</b>
                      <small>~{estimateWaitMinutes(p.score, waiting)} min</small>
                    </div>
                    <span className="wait">{waitSharePercent(p.score)}%</span>
                  </li>
                ))}
              </ol>
              <aside className="dossier">
                {!selected && <p className="muted">Toca un paciente para ver por qué tiene ese puntaje.</p>}
                {selected && selectedExplain && (
                  <>
                    <Chip priority={selected.priority} />
                    <h2>{selected.name}</h2>
                    <p className="muted">{selectedExplain.meaning}</p>
                    <p className="scoreline">Puntaje <b>{Number(selected.score).toFixed(1)}</b> / 100</p>
                    <p className="muted">{waitSummary(selected.score, waiting).text} Porcentaje de espera: {waitSharePercent(selected.score)}% (100% = ~2 horas en un caso leve).</p>
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
                    <div className="row-btns">
                      <button className="btn" onClick={() => moveToCare(selected.id)}>Pasar a atención</button>
                      <button className="ghost" onClick={() => { setRecheck({ ...selected, estimatedFields: [] }); setView("recheck"); }}>Volver a medir signos</button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </section>
        )}

        {view === "intake" && (
          <section className="page">
            <h1>Nuevo ingreso</h1>
            <p className="sub">Escribe lo que ves o te dicen. No hace falta saber medicina: cada casilla explica qué pedir.</p>
            <form className="sheet" onSubmit={analyze}>
              <AiIntake form={form} onApply={applyForm} comorbidities={COMORBIDITIES} flash={flash} />
              <h3>Quién es</h3>
              <div className="g2">
                <Field label="Nombre y apellido" help="Como aparece en la cédula o como se presenta.">
                  <input required value={form.name} onChange={(e) => setField("name", e.target.value)} />
                </Field>
                <Field label="Documento" help="Cédula, tarjeta de identidad o pasaporte.">
                  <input required value={form.document} onChange={(e) => setField("document", e.target.value)} />
                </Field>
                <Field label="Edad (años)" help="Si no la sabe, pregunte cuántos años tiene.">
                  <input required type="number" min="0" max="120" value={form.age} onChange={(e) => setField("age", e.target.value)} />
                </Field>
                <Field label="Sexo">
                  <select value={form.sex} onChange={(e) => setField("sex", e.target.value)}>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                    <option value="O">Otro / no dice</option>
                  </select>
                </Field>
                <Field className="full" label="¿Qué le pasa? (lo más grave)" help="Elija la opción que más se parezca. Eso cambia el orden de la cola.">
                  <select required value={form.conditionId} onChange={(e) => setField("conditionId", e.target.value)}>
                    <option value="">Seleccione una opción…</option>
                    {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
                {form.conditionId && <p className="field-help full-note">{conditions.find((c) => c.id === form.conditionId)?.hint}</p>}
                <Field className="full" label="Cuéntenos un poco más (opcional)" help="Con palabras simples: desde cuándo, si empeoró, si se golpeó.">
                  <textarea rows="2" value={form.reason} onChange={(e) => setField("reason", e.target.value)} />
                </Field>
              </div>
              <h3>Números del cuerpo (signos vitales)</h3>
              <p className="sub">Los toma el tensiómetro, el termómetro y el clip del dedo (oxímetro). Si aún no los tienen, pídalos al que toma los signos.</p>
              <div className="g3">
                <Field label="Oxígeno en sangre (%)" help="Clip en el dedo. Normal: 95 a 100. Si está bajo 94, avise."
                  ask="Saturación de oxígeno (SpO2, %)" value={form.spo2} context={caseContext} estimated={form.estimatedFields.includes("spo2")}>
                  <input required type="number" min="50" max="100" value={form.spo2} onChange={(e) => setField("spo2", e.target.value)} />
                </Field>
                <Field label="Latidos por minuto" help="Pulso. En un adulto tranquilo suele ser 60 a 100."
                  ask="Frecuencia cardiaca (latidos por minuto)" value={form.heartRate} context={caseContext} estimated={form.estimatedFields.includes("heartRate")}>
                  <input required type="number" min="20" max="220" value={form.heartRate} onChange={(e) => setField("heartRate", e.target.value)} />
                </Field>
                <Field label="Presión: número de arriba" help="El mayor del tensiómetro (sistólica). Ejemplo: en 120/80, este es 120."
                  ask="Presión arterial sistólica (mmHg)" value={form.systolic} context={caseContext} estimated={form.estimatedFields.includes("systolic")}>
                  <input required type="number" min="50" max="250" value={form.systolic} onChange={(e) => setField("systolic", e.target.value)} />
                </Field>
                <Field label="Presión: número de abajo" help="El menor (diastólica). En 120/80, este es 80."
                  ask="Presión arterial diastólica (mmHg)" value={form.diastolic} context={caseContext} estimated={form.estimatedFields.includes("diastolic")}>
                  <input required type="number" min="20" max="160" value={form.diastolic} onChange={(e) => setField("diastolic", e.target.value)} />
                </Field>
                <Field label="Temperatura (°C)" help="En la frente o axila. Un adulto suele estar cerca de 36.5 a 37.2."
                  ask="Temperatura corporal (°C)" value={form.temperature} context={caseContext} estimated={form.estimatedFields.includes("temperature")}>
                  <input required type="number" step="0.1" min="32" max="43" value={form.temperature} onChange={(e) => setField("temperature", e.target.value)} />
                </Field>
                <Field label="Respiraciones en un minuto" help="Cuente pechos que suben en 60 segundos. En reposo: más o menos 12 a 20."
                  ask="Frecuencia respiratoria (respiraciones por minuto)" value={form.respiratoryRate} context={caseContext} estimated={form.estimatedFields.includes("respiratoryRate")}>
                  <input required type="number" min="4" max="50" value={form.respiratoryRate} onChange={(e) => setField("respiratoryRate", e.target.value)} />
                </Field>
              </div>
              <h3>Otros datos (si los tiene)</h3>
              <p className="sub">No son obligatorios. Si no sabe qué son, toque el signo de pregunta y la IA se lo explica.</p>
              <div className="g3">
                <Field label="Glucosa / azúcar (mg/dL)" help="Glucómetro de dedo. Útil en diabéticos, desmayos o confusión."
                  ask="Glucosa en sangre (glucometría, mg/dL)" value={form.glucose} context={caseContext}>
                  <input type="number" min="10" max="1500" value={form.glucose} onChange={(e) => setField("glucose", e.target.value)} />
                </Field>
                <Field label="Dolor de 0 a 10" help="Pregunte: de 0 (nada) a 10 (el peor dolor de su vida)."
                  ask="Escala de dolor de 0 a 10" value={form.painScale} context={caseContext}>
                  <input type="number" min="0" max="10" value={form.painScale} onChange={(e) => setField("painScale", e.target.value)} />
                </Field>
                <Field label="Cómo está de conciencia" help="Escala AVPU: si no está alerta, el riesgo sube mucho."
                  ask="Estado de conciencia (escala AVPU)" value={form.consciousness} context={caseContext}>
                  <select value={form.consciousness} onChange={(e) => setField("consciousness", e.target.value)}>
                    {AVPU.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
              </div>
              <h3>¿Ya tenía alguna de estas enfermedades?</h3>
              <p className="sub">Marque solo si la persona lo dice o está en un papel. Si no sabe, déjelo vacío.</p>
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
              <button className="btn wide" type="submit" disabled={analyzeBusy}>{analyzeBusy ? "Analizando con el protocolo y la IA…" : "Calcular puntaje y explicar"}</button>
            </form>
          </section>
        )}

        {view === "result" && result && (
          <section className="page">
            <h1>Por qué salió este puntaje</h1>
            <p className="sub">Es una guía. Quien atiende confirma si está de acuerdo. El puntaje mezcla el dataset del hospital con el criterio clínico de Gemini.</p>
            <div className={`banner ${result.priority.tone}`}>
              <div className={`severity-stamp ${result.priority.tone}`}>
                {result.priority.chip}
              </div>
              <div className="banner-copy">
                <p className="severity-kicker">{result.priority.esi} · {result.priority.name}</p>
                <h2>{result.score.toFixed(1)} <span>/ 100</span></h2>
                <p className="danger-lead">{result.explanation.dangerLead}</p>
                <p>{result.explanation.meaning}</p>
                <p>{result.explanation.whyQueue}</p>
                <p>{waitSummary(result.score, waiting).text} Porcentaje de espera: {waitSharePercent(result.score)}% (un caso leve ≈ 100%, un caso crítico ≈ 2%).</p>
              </div>
              <DestinationCard patient={result} />
            </div>
            <EstimatedWarning fields={result.estimatedFields} />
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
            <div className="row-btns" style={{ marginTop: 16 }}>
              <button className="btn" onClick={confirmEntry}>Confirmar y poner en la cola</button>
              <button className="ghost" onClick={() => setView("intake")}>Corregir datos</button>
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
                <thead><tr><th>Persona</th><th>Qué le pasa</th><th>Puntaje</th><th>Prioridad</th><th>Área</th><th>Estado</th></tr></thead>
                <tbody>
                  {filtered.sort(comparePriority).map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><div className="muted">{p.age} años · {p.document}</div></td>
                      <td>{conditionLabel(p.conditionId)}</td>
                      <td>{Number(p.score).toFixed(1)}</td>
                      <td><Chip priority={p.priority} /></td>
                      <td>{p.destinationArea || "—"}{p.destinationCode && <div className="muted">{p.destinationCode}</div>}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {view === "stats" && <StatsView conditionLabel={conditionLabel} />}

        {view === "history" && (
          <section className="page">
            <h1>Historial</h1>
            <div className="sheet table-wrap">
              <table>
                <thead><tr><th>Persona</th><th>Hora del puntaje</th><th>Prioridad</th><th>NEWS2</th></tr></thead>
                <tbody>
                  {patients.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{new Date(p.arrivedAt).toLocaleString("es-CO")}</td>
                      <td><Chip priority={p.priority} /></td>
                      <td>{p.news2 ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                  <li>La lista se ordena del puntaje más alto al más bajo. Si empatan, gana quien llegó antes.</li>
                  <li>Si se vuelven a tomar los signos y empeoran, el puntaje sube y puede adelantar.</li>
                  <li>La conciencia (AVPU) suma en NEWS2. Si no responde o solo responde al dolor, sube a crítica. La glucosa por debajo de 54 o por encima de 600 también sube el piso.</li>
                  <li>Según el nivel se elige el área: reanimación, urgencias críticas, urgencias generales, consulta prioritaria o consulta externa. El dolor de pecho, el derrame, el trauma o la sepsis activan su código, y a los menores de 14 se les marca pediatría.</li>
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
