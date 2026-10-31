import { ageNorms, oxygenWord, rangeText } from "./ageNorms";

function num(raw) {
  if (raw === "" || raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function inRange(n, pair) {
  return n >= pair[0] && n <= pair[1];
}

function itemsFor(age) {
  const n = ageNorms(age);
  return [
    {
      key: "spo2",
      label: "Oxígeno en sangre",
      unit: "%",
      how: "Clip del dedo (oxímetro).",
      normal: rangeText(n.spo2, "%") + ` a los ${n.label}`,
      pair: n.spo2,
      bad: (v) => oxygenWord(v).badge,
      why: (v) => {
        const o = oxygenWord(v);
        return `Salió ${v}% a los ${n.label}. ${o.detail}`;
      },
    },
    {
      key: "heartRate",
      label: "Pulso (latidos por minuto)",
      unit: "",
      how: "En la muñeca o en el oxímetro.",
      normal: rangeText(n.hr) + ` a los ${n.label}`,
      pair: n.hr,
      bad: (v) => (v < n.hr[0] * 0.7 || v > n.hr[1] * 1.3 ? "muy alterado"
        : !inRange(v, n.hr) ? "fuera de lo habitual para la edad" : "bien"),
      why: (v) => inRange(v, n.hr)
        ? `Salió ${v}. Es un pulso de reposo razonable a los ${n.label}.`
        : `Salió ${v}. A los ${n.label} en reposo suele estar entre ${rangeText(n.hr)}. Eso mueve el puntaje.`,
    },
    {
      key: "systolic",
      label: "Presión de arriba",
      unit: "",
      how: "El número mayor del tensiómetro (ejemplo: en 120/80, este es 120).",
      normal: rangeText(n.sbp) + ` a los ${n.label}`,
      pair: n.sbp,
      bad: (v) => (v < 90 ? "baja" : v > 180 ? "muy alta" : !inRange(v, n.sbp) ? "fuera de lo habitual" : "aceptable"),
      why: (v) => v < 90
        ? `Salió ${v}. Baja de 90 puede significar que no llega bien la sangre a los órganos.`
        : v > 180
          ? `Salió ${v}. Está muy alta para cualquier edad.`
          : inRange(v, n.sbp)
            ? `Salió ${v}. Encaja con ${n.label}.`
            : `Salió ${v}. A los ${n.label} lo habitual es ${rangeText(n.sbp)}.`,
    },
    {
      key: "diastolic",
      label: "Presión de abajo",
      unit: "",
      how: "El número menor del tensiómetro (en 120/80, este es 80).",
      normal: rangeText(n.dbp) + ` a los ${n.label}`,
      pair: n.dbp,
      bad: (v) => (v < 50 ? "baja" : v > 110 ? "alta" : !inRange(v, n.dbp) ? "fuera de lo habitual" : "aceptable"),
      why: (v) => `Salió ${v}. A los ${n.label} lo habitual es ${rangeText(n.dbp)}.`,
    },
    {
      key: "temperature",
      label: "Temperatura",
      unit: "°C",
      how: "Termómetro en frente o axila.",
      normal: rangeText(n.temp, "°C"),
      pair: n.temp,
      bad: (v) => (v >= 39 ? "fiebre alta" : v <= 35.5 ? "baja" : "bien"),
      why: (v) => v >= 38
        ? `Salió ${v} °C: hay fiebre.`
        : v <= 35.5
          ? `Salió ${v} °C: el cuerpo está frío.`
          : `Salió ${v} °C: temperatura habitual.`,
    },
    {
      key: "respiratoryRate",
      label: "Respiraciones en un minuto",
      unit: "",
      how: "Cuente cuántas veces sube el pecho en 60 segundos.",
      normal: rangeText(n.rr) + ` a los ${n.label}`,
      pair: n.rr,
      bad: (v) => (v < n.rr[0] * 0.5 || v > n.rr[1] * 1.4 ? "alterada"
        : !inRange(v, n.rr) ? "fuera de lo habitual para la edad" : "bien"),
      why: (v) => inRange(v, n.rr)
        ? `Salió ${v}: ritmo de reposo para ${n.label}.`
        : `Salió ${v}. A los ${n.label} en reposo es ${rangeText(n.rr)}. Fuera de eso el puntaje sube.`,
    },
  ];
}

export function readVitals(patient) {
  const items = itemsFor(patient.age);
  return items.map((item) => {
    const value = num(patient[item.key]);
    const estimated = (patient.estimatedFields || []).includes(item.key);
    if (value == null) {
      return { ...item, value: null, estimated, tone: "muted", badge: "sin dato" };
    }
    const badge = estimated ? "no medido · reposo" : item.bad(value);
    const tone = estimated ? "est" : badge === "bien" || badge === "aceptable" ? "ok" : "bad";
    return { ...item, value, estimated, tone, badge, why: item.why(value) };
  });
}

export function vitalHint(key, raw, age) {
  if (raw === "" || raw == null) return null;
  const item = itemsFor(age).find((i) => i.key === key);
  if (!item) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const badge = item.bad(value);
  const ok = badge === "bien" || badge === "aceptable";
  return { badge, ok, text: `${badge} · lo normal a esa edad: ${item.normal}` };
}

export function crashSigns(form) {
  return readVitals(form).filter((row) => row.tone === "bad" && !row.estimated && row.value != null);
}

export function crashWarning(form) {
  const bad = crashSigns(form);
  if (!bad.length) return "";
  const list = bad.map((r) => `${r.label} ${r.value}${r.unit ? r.unit : ""} (${r.badge}; normal ${r.normal})`).join("; ");
  return `Estos números no son normales para esa edad: ${list}. `
    + "Así el puntaje sube aunque el motivo sea leve. "
    + "Si está practicando, use los signos de reposo de esa edad. Si los midió de verdad, calcule igual.";
}

export function fillRestingIfEmpty(form) {
  const rest = ageNorms(form.age).rest;
  const estimated = new Set(form.estimatedFields || []);
  const patch = {};
  for (const [key, value] of Object.entries(rest)) {
    if (form[key] === "" || form[key] == null) {
      patch[key] = String(value);
      estimated.add(key);
    }
  }
  patch.estimatedFields = Array.from(estimated);
  return { ...form, ...patch };
}
