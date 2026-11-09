/* English: identifiers in this file are English; on-screen copy stays Spanish. */
/** Shared ESI bands. Keep in sync with backend TriageBands. */
export const TRIAGE_BANDS = {
  ESI_I: 78,
  ESI_II: 62,
  ESI_III: 42,
  ESI_IV: 22,
  RESUSCITATION: 86,
  CARDIAC_ARREST: 97,
  MAX: 100,
  MIN: 0,
};

export function esiFloorFromSeverity(severity) {
  const n = Number(severity);
  if (!Number.isFinite(n)) return TRIAGE_BANDS.MIN;
  if (n >= TRIAGE_BANDS.ESI_I) return TRIAGE_BANDS.ESI_I;
  if (n >= TRIAGE_BANDS.ESI_II) return TRIAGE_BANDS.ESI_II;
  if (n >= TRIAGE_BANDS.ESI_III) return TRIAGE_BANDS.ESI_III;
  return TRIAGE_BANDS.MIN;
}

