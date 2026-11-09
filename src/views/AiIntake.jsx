import { useState } from "react";
import { intakeWithAi } from "../services/api";
import { resizePhoto } from "../models/photo";
import { VITAL_LABELS } from "../models/levels";
import { ageNorms } from "../models/ageNorms";
import { refreshEstimatedRest } from "../models/vitals";

const FILLABLE = ["age", "sex", "heartRate", "spo2", "systolic", "diastolic", "temperature", "respiratoryRate", "glucose", "painScale", "consciousness"];
const STORY_WINS = ["age", "sex"];

function isEmpty(value) {
  return value === "" || value === null || value === undefined;
}

/**
 * Relato escrito y foto opcional para armar el ingreso.
 */
export default function AiIntake({ form, onApply, comorbidities, flash }) {
  const story = form.story || "";
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(null);

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
      flash("Escriba qué le pasa, o adjunte una foto.");
      return;
    }
    setBusy(true);
    try {
      const known = {};
      FILLABLE.forEach((key) => {
        if (STORY_WINS.includes(key)) return;
        if (!isEmpty(form[key]) && !(form.estimatedFields || []).includes(key)) known[key] = form[key];
      });
      if (form.conditionId) known.conditionId = form.conditionId;
      const s = await intakeWithAi({
        story: [story, form.reason].filter(Boolean).join(". "),
        photo: form.photo,
        known,
        comorbidityOptions: comorbidities.map((c) => ({ id: c.id, label: c.label })),
      });
      if (!s?.active) throw new Error("No se pudo completar el caso. Llene el formulario a mano o intente en un momento.");

      const patch = {};
      const estimated = new Set(form.estimatedFields || []);
      FILLABLE.forEach((key) => {
        const value = s[key];
        if (isEmpty(value)) return;
        const leftover = STORY_WINS.includes(key);
        if (leftover || isEmpty(form[key]) || estimated.has(key)) {
          patch[key] = String(value);
          if (s.estimatedFields?.includes(key)) estimated.add(key);
          else estimated.delete(key);
        }
      });
      if (s.conditionId) patch.conditionId = s.conditionId;
      if (!form.reason && s.reason) patch.reason = s.reason;
      if (s.comorbidityIds?.length) {
        patch.comorbidityIds = Array.from(new Set([...(form.comorbidityIds || []), ...s.comorbidityIds]));
      }
      const next = { ...form, ...patch };
      Object.entries(ageNorms(next.age, { pregnant: form.pregnant, weeks: form.gestationWeeks }).rest).forEach(([key, value]) => {
        if (isEmpty(next[key]) && isEmpty(patch[key])) {
          patch[key] = String(value);
          estimated.add(key);
        }
      });
      patch.estimatedFields = Array.from(estimated);
      if (patch.age) {
        Object.assign(patch, refreshEstimatedRest({ ...form, ...patch }, patch.age));
      }
      onApply(patch);
      setNotes({ notes: s.notes || [], photoFindings: s.photoFindings, estimated: patch.estimatedFields });
      flash(estimated.size
        ? "Se armó el motivo. Los signos de reposo son guía: si puede, póngalos del oxímetro y el tensiómetro."
        : "Se armó el formulario. Revise cada dato antes de calcular.");
    } catch (e) {
      flash(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ai-intake">
      <div className="ai-intake-head">
        <h3><span className="step-num">1</span> ¿Qué está pasando?</h3>
        <p className="sub">Escríbalo. El relato, los signos y la foto (si hay) sirven para armar el caso. No hace falta escribir la causa: la evaluación la interpreta.</p>
      </div>
      <textarea
        rows="3"
        placeholder="Ej.: Señor de 67 años, dolor fuerte en el pecho que se le va al brazo izquierdo desde hace media hora, sudando, es diabético e hipertenso…"
        value={story}
        onChange={(e) => onApply({ story: e.target.value })}
      />
      <div className="ai-intake-actions">
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
          {busy ? "Leyendo el caso…" : "Completar el caso"}
        </button>
      </div>
      {notes && (
        <div className="ai-notes">
          {notes.estimated?.length > 0 && (
            <p className="warn-line">
              Signos no medidos (hay que tomarlos): {notes.estimated.map((f) => VITAL_LABELS[f] || f).join(", ")}.
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
