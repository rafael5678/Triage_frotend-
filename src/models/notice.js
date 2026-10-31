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

function ticketOf(patient) {
  const name = patient.name || "";
  const initials = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase()).join("") || "P";
  const doc = String(patient.document || "").replace(/\s/g, "");
  const tail = doc.length >= 3 ? doc.slice(-3) : doc;
  return patient.ticket || (tail ? `${initials}-${tail}` : initials);
}

function clock(patient) {
  const at = patient.arrivedAt || patient.evaluatedAt;
  if (!at) return "";
  return new Date(at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

/** Mismo texto que manda el aviso automático del servidor. */
export function noticeMessage(patient, position, now = Date.now()) {
  const name = firstName(patient.name);
  const ticket = ticketOf(patient);
  const area = patient.destinationArea || "Urgencias";
  const { left, max } = waitInfo(patient, now);
  const place = position ?? patient.queuePosition ?? "—";
  const when = clock(patient);
  if (patient.present === false) {
    return `Hola ${name}, su turno es ${ticket} en ${area} (puesto ${place}). Aún no registramos su llegada. `
      + `Preséntese en los próximos ${Math.max(5, left)} minutos y mire la pantalla: cuando salga ${ticket} pase a ${area}.`;
  }
  return `Hola ${name}, su turno es ${ticket} en ${area} (puesto ${place}, meta ${max} min${when ? `, llegó ${when}` : ""}). `
    + `Permanezca en la sala de espera y mire la pantalla: cuando salga ${ticket} pase a ${area}.`;
}

const MOBILE_PREFIX = new Set([
  "300", "301", "302", "303", "304", "305",
  "310", "311", "312", "313", "314", "315", "316", "317", "318", "319",
  "320", "321", "322", "323", "324", "333",
  "350", "351", "352", "353",
]);

export const WHATSAPP_HINT = "Use un celular colombiano de 10 dígitos que empiece por 3 (ejemplo 300 123 4567). No se aceptan números inventados.";

function localTen(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length === 12) digits = digits.slice(2);
  return digits;
}

export function isValidWhatsApp(raw) {
  if (!String(raw || "").trim()) return false;
  const ten = localTen(raw);
  if (ten.length !== 10 || !ten.startsWith("3")) return false;
  if (!MOBILE_PREFIX.has(ten.slice(0, 3))) return false;
  if (new Set(ten).size <= 2) return false;
  if (/^3\d0{8}$/.test(ten)) return false;
  if (new Set(ten.slice(3)).size <= 1) return false;
  return true;
}

export function phoneError(raw) {
  if (!String(raw || "").trim()) return "";
  return isValidWhatsApp(raw) ? "" : WHATSAPP_HINT;
}

/** Celular colombiano válido → 57 + 10 dígitos. */
export function normalizePhone(raw) {
  if (!isValidWhatsApp(raw)) return "";
  return `57${localTen(raw)}`;
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
