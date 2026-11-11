/** notice: staff UI module. User-facing copy stays in Spanish. */
const DEFAULT_MAX_WAIT = 30;
/** Same as the backend: notify if 10 minutes or less remain, or if they are in the first two places. */
export const NOTICE_LEAD_MINUTES = 10;
export const NOTICE_POSITION_LEAD = 2;

/** Minutes waited since arrival and minutes left before the protocol max (negative = overdue). */
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

/** Same wording the server uses for the automatic notice. */
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

export const WHATSAPP_HINT = "Use un celular colombiano de 10 dígitos que empiece por 3 (ejemplo 300 123 4567).";

function localTen(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("57") && digits.length >= 12) digits = digits.slice(2);
  return digits.slice(0, 10);
}

export function isValidWhatsApp(raw) {
  if (!String(raw || "").trim()) return false;
  const ten = localTen(raw);
  // Colombian mobiles are 3 + 9 digits (300, 310, 312, 315, 316, 318, 320, 350…).
  if (ten.length !== 10 || !/^3[0-5]/.test(ten)) return false;
  if (/^(\d)\1{9}$/.test(ten)) return false;
  return true;
}

export function phoneError(raw) {
  const typed = String(raw || "").trim();
  if (!typed) return "";
  const digits = String(raw || "").replace(/\D/g, "");
  const ten = localTen(raw);
  if (digits.replace(/^57/, "").length < 10) {
    return `Lleva ${ten.length} de 10 dígitos. Ejemplo: 318 668 0042.`;
  }
  if (!isValidWhatsApp(raw)) return WHATSAPP_HINT;
  return "";
}

/** Valid Colombian mobile → 57 + 10 digits. */
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
