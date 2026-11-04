let liveSymptoms = [];

export function setSymptomCatalog(rows) {
  liveSymptoms = Array.isArray(rows) ? rows : [];
}

export function symptomCatalog() {
  return liveSymptoms;
}

export function findSymptom(id) {
  if (!id) return null;
  return liveSymptoms.find((c) => c.id === id) || null;
}

export function conditionLabel(id) {
  return findSymptom(id)?.label || "Motivo no indicado";
}

/** Piso ESI: 78 crítica, 62 alta, 42 media, 22 baja. */
export function catalogEsiFloor(severity) {
  const n = Number(severity);
  if (!Number.isFinite(n)) return 0;
  if (n >= 78) return 78;
  if (n >= 62) return 62;
  if (n >= 42) return 42;
  if (n >= 22) return 22;
  return 0;
}
