import { VITAL_LABELS } from "../models/levels";
import { readVitals } from "../models/vitals";

export function DestinationCard({ patient, compact = false }) {
  if (!patient?.destinationArea) return null;
  return (
    <div className={`destination ${patient.priority?.tone || ""} ${compact ? "compact" : ""}`}>
      <small>Enviar a</small>
      <b>{patient.destinationArea}</b>
      {patient.destinationCode && <span className="code-tag">{patient.destinationCode}</span>}
      <p>
        {patient.maxWaitMinutes === 0
          ? "Atención inmediata, sin espera."
          : `Atender en máximo ${patient.maxWaitMinutes} minutos.`}
      </p>
      {!compact && patient.destinationReason && <p className="muted">{patient.destinationReason}.</p>}
    </div>
  );
}

export function EstimatedWarning({ fields }) {
  if (!fields?.length) return null;
  return (
    <p className="warn-line">
      Signos estimados por la IA, no medidos: {fields.map((f) => VITAL_LABELS[f] || f).join(", ")}. Mídalos cuanto antes y recalcule.
    </p>
  );
}

function Block({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div className={`reco-block ${tone || ""}`}>
      <h4>{title}</h4>
      <ul className="why-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

/** Cada signo, en palabras: cómo se toma, qué es normal y por qué movió el puntaje. */
export function VitalGuide({ patient }) {
  const rows = readVitals(patient);
  return (
    <div className="sheet vital-guide">
      <h3>Qué significan estos números</h3>
      <p className="sub">Lo “normal” depende de la edad ({patient.age ? `${patient.age} años` : "ponga la edad en el ingreso"}).</p>
      <ul className="vital-read">
        {rows.map((row) => (
          <li key={row.key} className={row.tone}>
            <div>
              <b>{row.label}</b>
              <span className={`badge ${row.tone}`}>{row.badge}</span>
            </div>
            <strong>{row.value == null ? "—" : `${row.value}${row.unit ? ` ${row.unit}` : ""}`}</strong>
            <small>Normal: {row.normal}. {row.how}</small>
            {row.why && <p>{row.why}{row.estimated ? " Este valor no se midió: es de reposo para poder calcular." : ""}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lo que la IA recomienda hacer con el paciente. */
export default function Recommendations({ patient }) {
  const any = patient.immediateActions?.length || patient.testsToOrder?.length || patient.monitoring?.length
    || patient.redFlags?.length || patient.symptomExplanation || patient.photoFindings;
  if (!any) return null;
  return (
    <div className="sheet recos">
      <h3>Qué hacer con este paciente (IA)</h3>
      {patient.photoFindings && (
        <div className="reco-block photo">
          <h4>Lo que se ve en la foto</h4>
          <p>{patient.photoFindings}</p>
        </div>
      )}
      <div className="reco-grid">
        <Block title="Hacer ya" items={patient.immediateActions} tone="urgent" />
        <Block title="Exámenes a pedir" items={patient.testsToOrder} />
        <Block title="Qué vigilar" items={patient.monitoring} />
        <Block title="Señales de alarma" items={patient.redFlags} tone="alarm" />
      </div>
      {patient.symptomExplanation && (
        <div className="reco-block">
          <h4>Por qué importan estos síntomas</h4>
          <p>{patient.symptomExplanation}</p>
        </div>
      )}
      <p className="muted small">La IA orienta; quien atiende confirma cada decisión.</p>
    </div>
  );
}
