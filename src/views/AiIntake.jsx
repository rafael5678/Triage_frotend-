import { useEffect, useRef, useState } from "react";
import { intakeWithAi } from "../services/api";
import { resizePhoto } from "../models/photo";
import { VITAL_LABELS } from "../models/levels";

const FILLABLE = ["age", "sex", "heartRate", "spo2", "systolic", "diastolic", "temperature", "respiratoryRate", "glucose", "painScale", "consciousness"];

function isEmpty(value) {
  return value === "" || value === null || value === undefined;
}

function speechRecognition() {
  return typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
}

/**
 * Caja "Contar lo que pasa": relato escrito o dictado y foto opcional.
 * La IA llena solo lo que está vacío; los signos que estima quedan marcados para medirlos.
 */
export default function AiIntake({ form, onApply, comorbidities, flash }) {
  const [story, setStory] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [notes, setNotes] = useState(null);
  const recognizer = useRef(null);
  const canDictate = Boolean(speechRecognition());

  useEffect(() => () => recognizer.current?.stop(), []);

  function toggleDictation() {
    if (listening) {
      recognizer.current?.stop();
      return;
    }
    const Recognition = speechRecognition();
    const rec = new Recognition();
    rec.lang = "es-CO";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (event) => {
      const text = Array.from(event.results).slice(event.resultIndex).map((r) => r[0].transcript).join(" ");
      setStory((current) => `${current} ${text}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognizer.current = rec;
    rec.start();
    setListening(true);
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      onApply({ photo: await resizePhoto(file) });
    } catch (e) {
      flash(e.message);
    }
  }

  async function fill() {
    if (!story.trim() && !form.photo) {
      flash("Escriba o dicte qué le pasa, o adjunte una foto.");
      return;
    }
    setBusy(true);
    try {
      const known = {};
      FILLABLE.forEach((key) => {
        if (!isEmpty(form[key]) && !(form.estimatedFields || []).includes(key)) known[key] = form[key];
      });
      if (form.conditionId) known.conditionId = form.conditionId;
      const s = await intakeWithAi({
        story: [story, form.reason].filter(Boolean).join(". "),
        photo: form.photo,
        known,
        comorbidityOptions: comorbidities.map((c) => ({ id: c.id, label: c.label })),
      });
      if (!s?.active) throw new Error("La IA no respondió. Llene el formulario a mano o intente en un momento.");

      const patch = {};
      const estimated = new Set(form.estimatedFields || []);
      FILLABLE.forEach((key) => {
        const value = s[key];
        if (isEmpty(value)) return;
        if (isEmpty(form[key]) || estimated.has(key)) {
          patch[key] = String(value);
          if (s.estimatedFields?.includes(key)) estimated.add(key);
          else estimated.delete(key);
        }
      });
      if (!form.conditionId && s.conditionId) patch.conditionId = s.conditionId;
      if (!form.reason && s.reason) patch.reason = s.reason;
      if (s.comorbidityIds?.length) {
        patch.comorbidityIds = Array.from(new Set([...(form.comorbidityIds || []), ...s.comorbidityIds]));
      }
      patch.estimatedFields = Array.from(estimated);
      onApply(patch);
      setNotes({ notes: s.notes || [], photoFindings: s.photoFindings, estimated: patch.estimatedFields });
      flash("La IA llenó el formulario. Revise cada dato antes de calcular.");
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-intake">
      <div className="ai-intake-head">
        <h3>Qué está pasando</h3>
        <p className="sub">Díctelo o escríbalo. Gemini completa edad, motivo y signos. Si hay herida, agregue foto.</p>
      </div>
      <textarea
        rows="3"
        placeholder="Ej.: Señor de 67 años, dolor fuerte en el pecho que se le va al brazo izquierdo desde hace media hora, sudando, es diabético e hipertenso…"
        value={story}
        onChange={(e) => setStory(e.target.value)}
      />
      <div className="ai-intake-actions">
        {canDictate && (
          <button type="button" className={listening ? "ghost rec" : "ghost"} onClick={toggleDictation}>
            {listening ? "Detener dictado" : "Dictar con la voz"}
          </button>
        )}
        <label className="ghost file-btn">
          {form.photo ? "Cambiar foto" : "Adjuntar o tomar foto"}
          <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
        </label>
        {form.photo && (
          <span className="photo-chip">
            <img src={form.photo.dataUrl} alt="Foto adjunta" />
            <button type="button" className="text" onClick={() => onApply({ photo: null })}>Quitar</button>
          </span>
        )}
        <button type="button" className="btn" onClick={fill} disabled={busy}>
          {busy ? "La IA está leyendo el caso…" : "Llenar con IA"}
        </button>
      </div>
      {notes && (
        <div className="ai-notes">
          {notes.estimated?.length > 0 && (
            <p className="warn-line">
              Estimados por la IA (hay que medirlos): {notes.estimated.map((f) => VITAL_LABELS[f] || f).join(", ")}.
            </p>
          )}
          {notes.photoFindings && <p><b>En la foto:</b> {notes.photoFindings}</p>}
          {notes.notes.length > 0 && (
            <ul className="why-list">{notes.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          )}
        </div>
      )}
    </div>
  );
}
