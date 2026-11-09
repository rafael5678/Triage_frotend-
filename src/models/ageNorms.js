/**
 * Reposo according to la edad. El oxígeno casi no cambia (95–100 a cualquier edad);
 * pulso, presión y respiración sí.
 */
function band(label, hr, rr, sbp, dbp, restHr, restSbp, restDbp, restRr, restSpo2 = 97) {
  return {
    label,
    hr,
    rr,
    sbp,
    dbp,
    spo2: [95, 100],
    temp: [36.1, 37.2],
    rest: {
      spo2: restSpo2,
      heartRate: restHr,
      systolic: restSbp,
      diastolic: restDbp,
      temperature: 36.6,
      respiratoryRate: restRr,
    },
  };
}

export function ageNorms(age, extra = {}) {
  const n = Number(age);
  const pregnant = Boolean(extra === true || extra.pregnant);
  const weeks = Number(extra.weeks ?? extra.gestationWeeks);
  let base;
  if (!Number.isFinite(n)) {
    base = band("adulto joven (ponga la edad)", [60, 100], [12, 20], [90, 120], [60, 80], 72, 118, 76, 16);
  } else if (n < 1) {
    base = band("menor de 1 año", [100, 160], [30, 60], [70, 100], [40, 70], 130, 85, 50, 40, 98);
  } else if (n < 4) {
    base = band(`${n} años (niño pequeño)`, [90, 150], [24, 40], [75, 110], [45, 75], 110, 95, 60, 28, 98);
  } else if (n < 6) {
    base = band(`${n} años`, [80, 140], [22, 34], [80, 115], [50, 75], 100, 100, 62, 24, 98);
  } else if (n < 12) {
    base = band(`${n} años`, [70, 120], [18, 30], [85, 120], [50, 80], 90, 105, 65, 22, 98);
  } else if (n < 18) {
    base = band(`${n} años (adolescente)`, [60, 110], [12, 24], [90, 125], [55, 80], 80, 112, 70, 18);
  } else if (n < 30) {
    base = band(`${n} años (joven)`, [60, 100], [12, 20], [90, 120], [60, 80], 72, 116, 74, 16);
  } else if (n < 45) {
    base = band(`${n} años`, [60, 100], [12, 20], [95, 130], [60, 85], 72, 120, 76, 16);
  } else if (n < 60) {
    base = band(`${n} años`, [60, 95], [12, 20], [100, 135], [65, 85], 70, 124, 78, 16);
  } else if (n < 70) {
    base = band(`${n} años`, [60, 90], [12, 22], [100, 145], [65, 90], 68, 128, 78, 16, 96);
  } else {
    base = band(`${n} años (adulto mayor)`, [55, 90], [12, 22], [100, 150], [60, 90], 66, 130, 78, 16, 96);
  }
  return pregnant ? withPregnancy(base, weeks) : base;
}

/** En el embarazo el pulso y la respiración suben un poco; 140/90 ya no es “normal”, es alerta. */
function withPregnancy(n, weeks) {
  const late = Number.isFinite(weeks) && weeks >= 28;
  const hr = [Math.max(55, n.hr[0] - 5), n.hr[1] + (late ? 20 : 15)];
  const rr = [Math.max(12, n.rr[0]), Math.max(n.rr[1], late ? 24 : 22)];
  const sbp = [n.sbp[0], Math.min(139, n.sbp[1])];
  const dbp = [Math.min(n.dbp[0], 60), Math.min(85, n.dbp[1])];
  const weekLabel = Number.isFinite(weeks) && weeks > 0 ? ` (${weeks} sem)` : "";
  return {
    ...n,
    label: `${n.label}, embarazada${weekLabel}`,
    hr,
    rr,
    sbp,
    dbp,
    spo2: [95, 100],
    rest: {
      ...n.rest,
      spo2: 97,
      heartRate: Math.min(hr[1] - 5, (n.rest.heartRate || 72) + 12),
      respiratoryRate: Math.min(rr[1] - 2, (n.rest.respiratoryRate || 16) + 3),
      systolic: Math.min(118, n.rest.systolic || 116),
      diastolic: Math.min(75, n.rest.diastolic || 74),
    },
  };
}

export function rangeText(pair, unit = "") {
  return `${pair[0]} a ${pair[1]}${unit ? ` ${unit}` : ""}`;
}

/** Oxígeno: 95–100 bien; 92–94 un poco bajo; 90–91 ya no es normal; 89 o menos crítico. */
export function oxygenWord(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { badge: "", ok: true, detail: "" };
  if (v > 190) return { badge: "revise el número", ok: false, detail: "Más de 190 no se acepta." };
  if (v > 100) return { badge: "así lo midieron", ok: true, detail: "Se guarda el número del oxímetro. Lo habitual es 95 a 100%." };
  if (v >= 95) return { badge: "bien", ok: true, detail: "95 a 100 es lo normal a cualquier edad." };
  if (v >= 92) return { badge: "un poco bajo", ok: false, detail: "Ya bajó de 95. Hay que repetir el clip y vigilar." };
  if (v >= 90) return { badge: "bajo · ya no es normal", ok: false, detail: "91 o menos no es normal. El puntaje sube." };
  return { badge: "crítico", ok: false, detail: "89 o menos: el cuerpo está recibiendo poco oxígeno. Eso es urgente." };
}
