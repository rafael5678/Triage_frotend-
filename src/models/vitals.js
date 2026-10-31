/** Valores de reposo si nadie midió. No son un diagnóstico: evitan que la IA invente un shock. */
export const RESTING_VITALS = {
  spo2: 97,
  heartRate: 78,
  systolic: 118,
  diastolic: 76,
  temperature: 36.6,
  respiratoryRate: 16,
};

const ITEMS = [
  {
    key: "spo2",
    label: "Oxígeno en sangre",
    unit: "%",
    how: "Clip del dedo (oxímetro).",
    normal: "95 a 100",
    bad: (n) => (n < 90 ? "muy bajo" : n < 94 ? "un poco bajo" : "bien"),
    why: (n) => n < 94
      ? `Salió ${n}%. Por debajo de 94 el cuerpo está recibiendo poco aire; por eso el puntaje sube.`
      : `Salió ${n}%. Está en el rango habitual.`,
  },
  {
    key: "heartRate",
    label: "Pulso (latidos por minuto)",
    unit: "",
    how: "En la muñeca o en el oxímetro.",
    normal: "60 a 100 en un adulto quieto",
    bad: (n) => (n < 40 || n > 130 ? "muy alterado" : n < 50 || n > 110 ? "fuera de lo habitual" : "bien"),
    why: (n) => (n < 50 || n > 110)
      ? `Salió ${n}. Un adulto en reposo suele estar entre 60 y 100. Muy lento o muy rápido sube el riesgo.`
      : `Salió ${n}. Está cerca del reposo.`,
  },
  {
    key: "systolic",
    label: "Presión de arriba",
    unit: "",
    how: "El número mayor del tensiómetro (ejemplo: en 120/80, este es 120).",
    normal: "90 a 140",
    bad: (n) => (n < 90 ? "baja" : n > 180 ? "muy alta" : "aceptable"),
    why: (n) => n < 90
      ? `Salió ${n}. Baja de 90 puede significar que no llega bien la sangre a los órganos.`
      : n > 180
        ? `Salió ${n}. Está muy alta.`
        : `Salió ${n}. No es un valor de emergencia por sí solo.`,
  },
  {
    key: "diastolic",
    label: "Presión de abajo",
    unit: "",
    how: "El número menor del tensiómetro (en 120/80, este es 80).",
    normal: "60 a 90",
    bad: (n) => (n < 50 ? "baja" : n > 110 ? "alta" : "aceptable"),
    why: (n) => `Salió ${n}. Se lee junto con la de arriba.`,
  },
  {
    key: "temperature",
    label: "Temperatura",
    unit: "°C",
    how: "Termómetro en frente o axila.",
    normal: "36.1 a 37.2",
    bad: (n) => (n >= 39 ? "fiebre alta" : n <= 35.5 ? "baja" : "bien"),
    why: (n) => n >= 38
      ? `Salió ${n} °C: hay fiebre.`
      : n <= 35.5
        ? `Salió ${n} °C: el cuerpo está frío.`
        : `Salió ${n} °C: temperatura habitual.`,
  },
  {
    key: "respiratoryRate",
    label: "Respiraciones en un minuto",
    unit: "",
    how: "Cuente cuántas veces sube el pecho en 60 segundos.",
    normal: "12 a 20 en reposo",
    bad: (n) => (n >= 25 || n <= 8 ? "alterada" : "bien"),
    why: (n) => (n >= 25 || n <= 8)
      ? `Salió ${n} por minuto. Fuera de 12–20 el puntaje sube.`
      : `Salió ${n}: ritmo habitual de reposo.`,
  },
];

export function readVitals(patient) {
  return ITEMS.map((item) => {
    const raw = patient[item.key];
    const value = raw === "" || raw == null ? null : Number(raw);
    const estimated = (patient.estimatedFields || []).includes(item.key);
    if (value == null || Number.isNaN(value)) {
      return { ...item, value: null, estimated, tone: "muted", badge: "sin dato" };
    }
    const badge = estimated ? "no medido · reposo" : item.bad(value);
    const tone = estimated ? "est" : badge === "bien" || badge === "aceptable" ? "ok" : "bad";
    return { ...item, value, estimated, tone, badge, why: item.why(value) };
  });
}

export function vitalHint(key, raw) {
  if (raw === "" || raw == null) return null;
  const item = ITEMS.find((i) => i.key === key);
  if (!item) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const badge = item.bad(value);
  const ok = badge === "bien" || badge === "aceptable";
  return { badge, ok, text: `${badge} · lo normal: ${item.normal}` };
}

/** Signos tan extremos que un dolor de cabeza no los explica: alguien los midió mal o el paciente está grave de verdad. */
export function crashSigns(form) {
  return readVitals(form).filter((row) => row.tone === "bad" && !row.estimated && row.value != null);
}

export function crashWarning(form) {
  const bad = crashSigns(form);
  if (!bad.length) return "";
  const list = bad.map((r) => `${r.label} ${r.value}${r.unit ? r.unit : ""} (${r.badge}; normal ${r.normal})`).join("; ");
  return `Estos números no son de un malestar leve: ${list}. `
    + "Así el puntaje sale crítico aunque el motivo sea “dolor de cabeza”. "
    + "Si está practicando, use “Signos de un adulto en reposo”. Si los midió de verdad, calcule igual: hay que tratarlo como emergencia.";
}

export function fillRestingIfEmpty(form) {
  const estimated = new Set(form.estimatedFields || []);
  const patch = {};
  for (const [key, value] of Object.entries(RESTING_VITALS)) {
    if (form[key] === "" || form[key] == null) {
      patch[key] = String(value);
      estimated.add(key);
    }
  }
  patch.estimatedFields = Array.from(estimated);
  return { ...form, ...patch };
}
