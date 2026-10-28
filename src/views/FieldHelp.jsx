import { useState } from "react";
import { explainField } from "../services/api";

const cache = new Map();

/** Botón "?" que le pide a la IA explicar un dato del formulario y lo que significa el valor escrito. */
export default function FieldHelp({ field, value, context }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const key = `${field}|${value ?? ""}`;
    if (cache.has(key)) {
      setData(cache.get(key));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const answer = await explainField(field, value, context);
      if (!answer?.active) throw new Error("La IA no respondió. Intente de nuevo en un momento.");
      cache.set(key, answer);
      setData(answer);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="field-help-ai">
      <button type="button" className="qmark" onClick={toggle} aria-label={`Qué es ${field}`} title="Pregúntele a la IA qué es esto">?</button>
      {open && (
        <span className="help-pop" role="note">
          {busy && <span className="muted">La IA está explicando…</span>}
          {error && <span className="form-err">{error}</span>}
          {data && !busy && (
            <>
              {data.whatIs && <span><b>Qué es:</b> {data.whatIs}</span>}
              {data.howToMeasure && <span><b>Cómo se mide:</b> {data.howToMeasure}</span>}
              {data.normalRange && <span><b>Normal:</b> {data.normalRange}</span>}
              {data.valueMeaning && <span><b>Su valor:</b> {data.valueMeaning}</span>}
              {data.whatToDo && <span><b>Qué hacer:</b> {data.whatToDo}</span>}
            </>
          )}
        </span>
      )}
    </span>
  );
}
