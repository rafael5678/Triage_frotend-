const DEFAULT_MAX_WAIT = 30;
/** Igual que el backend: avisar si quedan 10 minutos o menos, o si está entre los 2 primeros. */
export const NOTICE_LEAD_MINUTES = 10;
export const NOTICE_POSITION_LEAD = 2;

/** Cuánto lleva esperando desde que llegó y cuánto le queda de su tiempo máximo (negativo = vencido). */
export function waitInfo(patient, now = Date.now()) {
  const start = patient.arrivedAt || patient.evaluatedAt || now;
  const waited = Math.max(0, Math.floor((now - start) / 60000));
  const max = patient.maxWaitMinutes ?? DEFAULT_MAX_WAIT;
  const left = max - waited;
  return { waited, max, left, overdue: left < 0, soon: left >= 0 && left <= NOTICE_LEAD_MINUTES };
}

export function noticeDue(patient, position, now = Date.now()) {
  if (patient.status !== "En espera" || patient.notifiedAt) return false;
  const { left } = waitInfo(patient, now);
  return left <= NOTICE_LEAD_MINUTES || (position != null && position <= NOTICE_POSITION_LEAD);
}

function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

/** Mismo texto que manda el aviso automático del servidor. */
export function noticeMessage(patient, position, now = Date.now()) {
  const name = firstName(patient.name);
  const area = patient.destinationArea || "Urgencias";
  const { left } = waitInfo(patient, now);
  if (patient.present === false) {
    return `Hola ${name}, le escribimos de Urgencias. Su turno en ${area} está por vencerse y aún no registramos su llegada. `
      + `Por favor preséntese en los próximos ${Math.max(5, left)} minutos para conservar su prioridad.`;
  }
  return `Hola ${name}, le escribimos de Urgencias. Su turno en ${area} está cerca (puesto ${position ?? "—"}). `
    + "Por favor permanezca en la sala de espera.";
}

/** Celular colombiano de 10 dígitos que empieza en 3 → se le antepone 57. */
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

export function whatsappLink(patient, position, now = Date.now()) {
  const phone = normalizePhone(patient.phone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(noticeMessage(patient, position, now))}`;
}

export function minutesLabel(minutes) {
  const m = Math.abs(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}
