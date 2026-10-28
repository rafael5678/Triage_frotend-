import { useEffect, useState } from "react";
import { createUser, fetchAdminSymptoms, fetchAdminUsers, fetchPatients, saveSymptom, setUserActive } from "../services/api";
import { comparePriority } from "../models/patient";
import StatsView from "./StatsView";

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
        <small>Portal administrador</small>
      </div>
    </div>
  );
}

const EMPTY_SYMPTOM = { label: "", hint: "", severity: 50, active: true };
const EMPTY_USER = { username: "", password: "", displayName: "", role: "STAFF" };

export default function AdminPortal({ user, onLogout }) {
  const [tab, setTab] = useState("symptoms");
  const [symptoms, setSymptoms] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [patients, setPatients] = useState([]);
  const [symptomForm, setSymptomForm] = useState(EMPTY_SYMPTOM);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);

  function flash(message) {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  }

  async function reload() {
    try {
      const [s, u, p] = await Promise.all([
        fetchAdminSymptoms(),
        fetchAdminUsers(),
        fetchPatients().catch(() => []),
      ]);
      setSymptoms(s);
      setAccounts(u);
      setPatients(p);
    } catch (error) {
      flash(error.message);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function onSaveSymptom(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveSymptom({
        id: symptomForm.id,
        label: symptomForm.label,
        hint: symptomForm.hint,
        severity: Number(symptomForm.severity),
        active: symptomForm.active !== false,
      });
      setSymptomForm(EMPTY_SYMPTOM);
      await reload();
      flash("Síntoma guardado.");
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreateUser(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await createUser(userForm);
      setUserForm(EMPTY_USER);
      await reload();
      flash("Cuenta creada. Esa persona ya puede entrar con su usuario.");
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(account) {
    try {
      await setUserActive(account.id, !account.active);
      await reload();
    } catch (error) {
      flash(error.message);
    }
  }

  return (
    <div className="app">
      <aside className="side">
        <Logo />
        <nav>
          <button className={tab === "symptoms" ? "on" : ""} onClick={() => setTab("symptoms")}>Síntomas / celdas</button>
          <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>Cuentas de acceso</button>
          <button className={tab === "patients" ? "on" : ""} onClick={() => setTab("patients")}>Pacientes en sala</button>
          <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>Estadísticas</button>
          <a className="side-link" href="#/sala" target="_blank" rel="noreferrer">Pantalla de sala</a>
        </nav>
        <div className="me">
          <span className="ava">AD</span>
          <div>
            <b>{user.displayName}</b>
            <small>Administrador</small>
          </div>
        </div>
      </aside>
      <div className="stage">
        <header className="bar">
          <p className="muted" style={{ margin: 0 }}>Lo que agregue aquí es lo que verá el personal al ingresar un paciente.</p>
          <div className="bar-meta">
            <button className="text" onClick={onLogout}>Salir</button>
          </div>
        </header>
        {toast && <div className="toast">{toast}</div>}

        {tab === "symptoms" && (
          <section className="page">
            <h1>Síntomas del formulario</h1>
            <p className="sub">Cada fila es una opción del menú “¿Qué le pasa?”. La gravedad (0–100) ayuda a ordenar la cola.</p>
            <form className="sheet" onSubmit={onSaveSymptom}>
              <div className="g2">
                <label>Texto que verá el personal
                  <input required value={symptomForm.label} onChange={(e) => setSymptomForm({ ...symptomForm, label: e.target.value })} />
                </label>
                <label>Gravedad (0 a 100)
                  <input required type="number" min="0" max="100" value={symptomForm.severity} onChange={(e) => setSymptomForm({ ...symptomForm, severity: e.target.value })} />
                </label>
                <label className="full">Ayuda corta (opcional)
                  <input value={symptomForm.hint} onChange={(e) => setSymptomForm({ ...symptomForm, hint: e.target.value })} />
                </label>
              </div>
              <button className="btn" disabled={busy} type="submit">{symptomForm.id ? "Actualizar síntoma" : "Agregar síntoma"}</button>
              {symptomForm.id && (
                <button className="ghost" type="button" onClick={() => setSymptomForm(EMPTY_SYMPTOM)}>Cancelar edición</button>
              )}
            </form>
            <div className="sheet table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr><th>Opción</th><th>Gravedad</th><th></th></tr>
                </thead>
                <tbody>
                  {symptoms.length === 0 && (
                    <tr><td colSpan="3" className="muted">Aún no hay síntomas en la base.</td></tr>
                  )}
                  {symptoms.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <b>{s.label}</b>
                        <div className="muted">{s.hint}</div>
                      </td>
                      <td>{s.severity}</td>
                      <td>
                        <button className="text" type="button" onClick={() => setSymptomForm({ id: s.id, label: s.label, hint: s.hint || "", severity: s.severity, active: s.active })}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "users" && (
          <section className="page">
            <h1>Quién puede usar la aplicación</h1>
            <p className="sub">Cree cuentas de personal (sala de urgencias) o de administrador. No hay usuarios fijos en el código: todo sale de la base.</p>
            <form className="sheet" onSubmit={onCreateUser}>
              <div className="g2">
                <label>Nombre para mostrar
                  <input required value={userForm.displayName} onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })} />
                </label>
                <label>Usuario
                  <input required autoComplete="off" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} />
                </label>
                <label>Contraseña
                  <input required type="password" autoComplete="new-password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
                </label>
                <label>Módulo
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="STAFF">Personal de urgencias</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </label>
              </div>
              <button className="btn" disabled={busy} type="submit">Crear cuenta</button>
            </form>
            <div className="sheet table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr><th>Persona</th><th>Usuario</th><th>Módulo</th><th></th></tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.displayName}</td>
                      <td>{a.username}</td>
                      <td>{a.role === "ADMIN" ? "Administrador" : "Urgencias"}</td>
                      <td>
                        {a.id !== user.id && (
                          <button className="text" type="button" onClick={() => toggleActive(a)}>
                            {a.active === false ? "Activar" : "Desactivar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "stats" && (
          <StatsView conditionLabel={(id) => symptoms.find((s) => s.id === id)?.label || id} />
        )}

        {tab === "patients" && (
          <section className="page">
            <h1>Pacientes registrados</h1>
            <p className="sub">Los ingresos los hace el personal. Aquí solo se consultan los que ya están en la base.</p>
            <div className="sheet table-wrap">
              {patients.length === 0 && <p className="muted">No hay pacientes todavía.</p>}
              <table>
                <thead>
                  <tr><th>Persona</th><th>Documento</th><th>Puntaje</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {patients.sort(comparePriority).map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.document}</td>
                      <td>{Number(p.score).toFixed(1)}</td>
                      <td>{p.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
