/**
 * Reposo según la edad. El oxígeno casi no cambia (95–100 a cualquier edad);
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

export function ageNorms(age) {
  const n = Number(age);
  if (!Number.isFinite(n)) {
    return band("adulto joven (ponga la edad)", [60, 100], [12, 20], [90, 120], [60, 80], 72, 118, 76, 16);
  }
  if (n < 1) {
    return band("menor de 1 año", [100, 160], [30, 60], [70, 100], [40, 70], 130, 85, 50, 40, 98);
  }
  if (n < 4) {
    return band(`${n} años (niño pequeño)`, [90, 150], [24, 40], [75, 110], [45, 75], 110, 95, 60, 28, 98);
  }
  if (n < 6) {
    return band(`${n} años`, [80, 140], [22, 34], [80, 115], [50, 75], 100, 100, 62, 24, 98);
  }
  if (n < 12) {
    return band(`${n} años`, [70, 120], [18, 30], [85, 120], [50, 80], 90, 105, 65, 22, 98);
  }
  if (n < 16) {
    return band(`${n} años (adolescente)`, [60, 110], [12, 24], [90, 125], [55, 80], 80, 112, 70, 18);
  }
  // 16–29 ≈ veinte años: corazón más rápido en reposo que un mayor, presión más baja.
  if (n < 30) {
    return band(`${n} años (joven)`, [60, 100], [12, 20], [90, 120], [60, 80], 72, 116, 74, 16);
  }
  // ~40 años
  if (n < 45) {
    return band(`${n} años`, [60, 100], [12, 20], [95, 130], [60, 85], 72, 120, 76, 16);
  }
  // ~50 años: la presión de reposo suele ir un poco más arriba.
  if (n < 60) {
    return band(`${n} años`, [60, 95], [12, 20], [100, 135], [65, 85], 70, 124, 78, 16);
  }
  // ~60–69
  if (n < 70) {
    return band(`${n} años`, [60, 90], [12, 22], [100, 145], [65, 90], 68, 128, 78, 16, 96);
  }
  // 70+
  return band(`${n} años (adulto mayor)`, [55, 90], [12, 22], [100, 150], [60, 90], 66, 130, 78, 16, 96);
}

export function rangeText(pair, unit = "") {
  return `${pair[0]} a ${pair[1]}${unit ? ` ${unit}` : ""}`;
}

/** Oxígeno: 95–100 bien; 92–94 un poco bajo; 90–91 ya no es normal; 89 o menos crítico. */
export function oxygenWord(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return { badge: "", ok: true, detail: "" };
  if (v >= 95) return { badge: "bien", ok: true, detail: "95 a 100 es lo normal a cualquier edad." };
  if (v >= 92) return { badge: "un poco bajo", ok: false, detail: "Ya bajó de 95. Hay que repetir el clip y vigilar." };
  if (v >= 90) return { badge: "bajo · ya no es normal", ok: false, detail: "91 o menos no es normal. El puntaje sube." };
  return { badge: "crítico", ok: false, detail: "89 o menos: el cuerpo está recibiendo poco oxígeno. Eso es urgente." };
}
