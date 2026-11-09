import { useEffect, useState } from "react";
import { createUser, fetchAdminSymptoms, fetchAdminUser, fetchAdminUsers, fetchPatients, saveSymptom, setUserActive, updateUser } from "../services/api";
import { comparePriority, matchesPatientSearch } from "../models/patient";
import { loginFieldError, withoutSpaces, LOGIN_PASSWORD_MAX, PASSWORD_MIN, PASSWORD_MAX, USERNAME_MIN, USERNAME_MAX } from "../models/credentials";
import { priorityFromScore } from "../ml/model";
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
  const [editingId, setEditingId] = useState(null);
  const [originalPassword, setOriginalPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const severityPreview = priorityFromScore(Number(symptomForm.severity) || 0);

  function flash(message) {
    setToast(message);
    setTimeout(() => setToast(""), 4000);
  }

  async function loadSymptoms() {
    try {
      setSymptoms(await fetchAdminSymptoms());
    } catch (error) {
      flash(error.message);
    }
  }

  async function loadUsers() {
    try {
      setAccounts(await fetchAdminUsers());
    } catch (error) {
      flash(error.message);
    }
  }

  async function loadPatients() {
    try {
      setPatients(await fetchPatients());
    } catch (error) {
      flash(error.message);
    }
  }

  useEffect(() => {
    if (tab === "symptoms") loadSymptoms();
    if (tab === "users") loadUsers();
    if (tab === "patients") loadPatients();
  }, [tab]);

  async function onSaveSymptom(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const saved = await saveSymptom({
        id: symptomForm.id,
        label: symptomForm.label,
        hint: symptomForm.hint,
        severity: Number(symptomForm.severity),
        active: symptomForm.active !== false,
      });
      setSymptomForm(EMPTY_SYMPTOM);
      setSymptoms((rows) => {
        const next = [saved, ...rows.filter((row) => row.id !== saved.id)];
        return next.sort((a, b) => (Number(b.severity) || 0) - (Number(a.severity) || 0));
      });
      flash("Síntoma guardado.");
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function startEdit(account) {
    setEditingId(account.id);
    setShowPassword(false);
    setOriginalPassword("");
    setUserForm({
      username: account.username || "",
      password: "",
      displayName: account.displayName || "",
      role: account.role || "STAFF",
    });
    try {
      const detail = await fetchAdminUser(account.id);
      const current = detail.password || "";
      setOriginalPassword(current);
      setUserForm({
        username: detail.username || account.username || "",
        password: current,
        displayName: detail.displayName || account.displayName || "",
        role: detail.role || account.role || "STAFF",
      });
    } catch (error) {
      flash(error.message);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setOriginalPassword("");
    setShowPassword(false);
    setUserForm(EMPTY_USER);
  }

  async function onCreateUser(event) {
    event.preventDefault();
    const username = withoutSpaces(userForm.username);
    const password = withoutSpaces(userForm.password);
    const passwordUnchanged = Boolean(editingId && password && password === originalPassword);
    const invalid = loginFieldError(username, password, {
      passwordRequired: !editingId,
      passwordMax: passwordUnchanged ? LOGIN_PASSWORD_MAX : PASSWORD_MAX,
    });
    if (invalid) {
      flash(invalid);
      return;
    }
    if (!userForm.displayName?.trim()) {
      flash("Falta el nombre para mostrar.");
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        const self = editingId === user.id;
        const payload = {
          username,
          displayName: userForm.displayName.trim(),
          role: userForm.role,
        };
        if (password) payload.password = password;
        const updated = await updateUser(editingId, payload);
        setEditingId(null);
        setOriginalPassword("");
        setShowPassword(false);
        setUserForm(EMPTY_USER);
        setAccounts((rows) => rows.map((row) => (row.id === editingId ? { ...row, ...updated } : row)));
        flash(self
          ? "Cuenta actualizada. Si cambió el usuario o la clave, entre de nuevo."
          : "Cuenta actualizada.");
      } else {
        const created = await createUser({ ...userForm, username, password });
        setUserForm(EMPTY_USER);
        setAccounts((rows) => [created, ...rows.filter((row) => row.id !== created.id)]);
        flash("Cuenta creada. Esa persona ya puede entrar con su usuario.");
      }
    } catch (error) {
      flash(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(account) {
    const nextActive = account.active === false;
    setAccounts((rows) => rows.map((row) => (row.id === account.id ? { ...row, active: nextActive } : row)));
    try {
      const saved = await setUserActive(account.id, nextActive);
      if (saved) {
        setAccounts((rows) => rows.map((row) => (row.id === account.id ? { ...row, ...saved, active: nextActive } : row)));
      }
      flash(nextActive
        ? "Cuenta activada. Esa persona ya puede entrar."
        : "Cuenta desactivada. Esa persona ya no puede entrar.");
    } catch (error) {
      loadUsers();
      flash(error.message);
    }
  }

  return (
    <div className="app">
      <aside className="side">
        <Logo />
        <nav>
          <p className="nav-label">Configuración</p>
          <button className={tab === "symptoms" ? "on" : ""} onClick={() => setTab("symptoms")}>Síntomas / celdas</button>
          <button className={tab === "users" ? "on" : ""} onClick={() => setTab("users")}>Cuentas de acceso</button>
          <p className="nav-label">Monitoreo</p>
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
            <div className="split">
            <form className="sheet symptom-form" onSubmit={onSaveSymptom}>
              <h3>Agregar síntoma</h3>
              <label>Texto que verá el personal
                <input required value={symptomForm.label} onChange={(e) => setSymptomForm({ ...symptomForm, label: e.target.value })} />
              </label>
              <label>Ayuda corta (opcional)
                <input value={symptomForm.hint} onChange={(e) => setSymptomForm({ ...symptomForm, hint: e.target.value })} />
              </label>
              <label>Gravedad (0 a 100)
                <input required type="range" min="0" max="100" value={Number(symptomForm.severity) || 0} onChange={(e) => setSymptomForm({ ...symptomForm, severity: e.target.value })} />
                <input required type="number" min="0" max="100" value={symptomForm.severity} onChange={(e) => setSymptomForm({ ...symptomForm, severity: e.target.value })} />
              </label>
              <div className={`severity-preview ${severityPreview.tone}`}>
                <span className={`score-tile ${severityPreview.tone}`}>{Number(symptomForm.severity) || 0}</span>
                <div>
                  <b>{severityPreview.chip}</b>
                  <p className="muted">{severityPreview.meaning}</p>
                </div>
                <i className="severity-bar" style={{ width: `${Math.min(100, Math.max(0, Number(symptomForm.severity) || 0))}%` }} />
              </div>
              <p className="hint">78 Crítica · 62 Alta · 42 Media · 22 Baja · 0 Mínima. Ese número alimenta el puntaje de la cola.</p>
              <div className="row-btns form-actions">
                <button className="btn" disabled={busy} type="submit">{symptomForm.id ? "Actualizar síntoma" : "Agregar síntoma"}</button>
                {symptomForm.id && (
                  <button className="ghost" type="button" onClick={() => setSymptomForm(EMPTY_SYMPTOM)}>Cancelar edición</button>
                )}
              </div>
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
            </div>
          </section>
        )}

        {tab === "users" && (
          <section className="page">
            <h1>Quién puede usar la aplicación</h1>
            <p className="sub">Cree o edite cuentas de personal y de administrador: nombre, usuario y contraseña. Todo sale de la base.</p>
            <form className="sheet" onSubmit={onCreateUser}>
              <div className="g2">
                <label>Nombre para mostrar
                  <input required value={userForm.displayName} onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })} />
                </label>
                <label>Usuario
                  <input required autoComplete="off" maxLength={USERNAME_MAX} value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: withoutSpaces(e.target.value) })} />
                  <small className="hint">De {USERNAME_MIN} a {USERNAME_MAX} caracteres. Letras, números, punto o guion. Sin espacios ni tildes.</small>
                </label>
                <label>Contraseña
                  <span className="pass-wrap">
                    <input required={!editingId} type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={editingId ? LOGIN_PASSWORD_MAX : PASSWORD_MAX} value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: withoutSpaces(e.target.value) })} />
                    <button type="button" className="text show-pass" onClick={() => setShowPassword((v) => !v)}>{showPassword ? "Ocultar" : "Mostrar"}</button>
                  </span>
                  <small className="hint">De {PASSWORD_MIN} a {PASSWORD_MAX} caracteres, sin espacios.</small>
                </label>
                <label>Módulo
                  <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
                    <option value="STAFF">Personal de urgencias</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </label>
              </div>
              <div className="row-btns">
                <button className="btn" disabled={busy} type="submit">{editingId ? "Guardar cambios" : "Crear cuenta"}</button>
                {editingId && <button className="ghost" type="button" onClick={cancelEdit}>Cancelar</button>}
              </div>
            </form>
            <div className="sheet table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr><th>Persona</th><th>Usuario</th><th>Módulo</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id} className={a.active === false ? "account-off" : ""}>
                      <td>{a.displayName}</td>
                      <td>{a.username}</td>
                      <td>{a.role === "ADMIN" ? "Administrador" : "Urgencias"}</td>
                      <td>{a.active === false ? <b className="account-off-tag">Desactivada</b> : "Activa"}</td>
                      <td>
                        <button className="text" type="button" onClick={() => startEdit(a)}>Editar</button>
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
            <input className="search-box" placeholder="Buscar por nombre o cédula…" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="sheet table-wrap">
              {patients.length === 0 && <p className="muted">No hay pacientes todavía.</p>}
              <table>
                <thead>
                  <tr><th>Persona</th><th>Documento</th><th>Puntaje</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {patients.filter((p) => matchesPatientSearch(p, query)).sort(comparePriority).map((p) => (
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
