/** Nivel de triaje que devuelve el backend, con el mismo color y texto que usa la cola. */
export const LEVELS = {
  TRIAGE_I_ROJO: { id: "I", tone: "i", chip: "Crítica", name: "Reanimación" },
  TRIAGE_II_NARANJA: { id: "II", tone: "ii", chip: "Alta", name: "Emergencia" },
  TRIAGE_III_AMARILLO: { id: "III", tone: "iii", chip: "Media", name: "Urgente" },
  TRIAGE_IV_VERDE: { id: "IV", tone: "iv", chip: "Baja", name: "Menos urgente" },
  TRIAGE_V_AZUL: { id: "V", tone: "v", chip: "Mínima", name: "No urgente" },
};

export function levelInfo(level) {
  return LEVELS[level] || { id: "?", tone: "v", chip: "Sin nivel", name: "Sin nivel" };
}

export const AVPU = [
  { id: "", label: "No se ha revisado" },
  { id: "A", label: "A · Alerta: habla y responde normal" },
  { id: "C", label: "C · Confundido de forma nueva" },
  { id: "V", label: "V · Solo responde si le hablan fuerte" },
  { id: "P", label: "P · Solo responde al dolor (pellizco)" },
  { id: "U", label: "U · No responde a nada" },
];

export const VITAL_LABELS = {
  heartRate: "Latidos por minuto",
  spo2: "Oxígeno en sangre",
  systolic: "Presión de arriba",
  diastolic: "Presión de abajo",
  temperature: "Temperatura",
  respiratoryRate: "Respiraciones por minuto",
};
