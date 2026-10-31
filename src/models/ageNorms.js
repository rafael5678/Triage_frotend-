/**
 * Qué es “normal” según la edad, en reposo.
 * Un bebé con 140 latidos está bien; un joven de 20 no.
 */
export function ageNorms(age) {
  const n = Number(age);
  if (!Number.isFinite(n) || n >= 16 && n < 40) {
    return {
      label: n >= 16 && n < 40 ? `${n} años (adulto joven)` : "adulto joven",
      hr: [60, 100],
      rr: [12, 20],
      sbp: [90, 130],
      dbp: [60, 85],
      spo2: [95, 100],
      temp: [36.1, 37.2],
      rest: { spo2: 97, heartRate: 72, systolic: 118, diastolic: 76, temperature: 36.6, respiratoryRate: 16 },
    };
  }
  if (n < 1) {
    return {
      label: "menor de 1 año",
      hr: [100, 160],
      rr: [30, 60],
      sbp: [70, 100],
      dbp: [40, 70],
      spo2: [95, 100],
      temp: [36.5, 37.5],
      rest: { spo2: 98, heartRate: 130, systolic: 85, diastolic: 50, temperature: 37.0, respiratoryRate: 40 },
    };
  }
  if (n < 4) {
    return {
      label: `${n} años (niño pequeño)`,
      hr: [90, 150],
      rr: [24, 40],
      sbp: [75, 110],
      dbp: [45, 75],
      spo2: [95, 100],
      temp: [36.4, 37.5],
      rest: { spo2: 98, heartRate: 110, systolic: 95, diastolic: 60, temperature: 36.8, respiratoryRate: 28 },
    };
  }
  if (n < 6) {
    return {
      label: `${n} años`,
      hr: [80, 140],
      rr: [22, 34],
      sbp: [80, 115],
      dbp: [50, 75],
      spo2: [95, 100],
      temp: [36.3, 37.4],
      rest: { spo2: 98, heartRate: 100, systolic: 100, diastolic: 62, temperature: 36.7, respiratoryRate: 24 },
    };
  }
  if (n < 12) {
    return {
      label: `${n} años`,
      hr: [70, 120],
      rr: [18, 30],
      sbp: [85, 120],
      dbp: [50, 80],
      spo2: [95, 100],
      temp: [36.2, 37.3],
      rest: { spo2: 98, heartRate: 90, systolic: 105, diastolic: 65, temperature: 36.6, respiratoryRate: 22 },
    };
  }
  if (n < 16) {
    return {
      label: `${n} años (adolescente)`,
      hr: [60, 110],
      rr: [12, 24],
      sbp: [90, 125],
      dbp: [55, 80],
      spo2: [95, 100],
      temp: [36.1, 37.2],
      rest: { spo2: 97, heartRate: 80, systolic: 112, diastolic: 70, temperature: 36.6, respiratoryRate: 18 },
    };
  }
  if (n >= 65) {
    return {
      label: `${n} años (adulto mayor)`,
      hr: [60, 90],
      rr: [12, 20],
      sbp: [100, 150],
      dbp: [60, 90],
      spo2: [95, 100],
      temp: [36.0, 37.2],
      rest: { spo2: 96, heartRate: 70, systolic: 128, diastolic: 78, temperature: 36.5, respiratoryRate: 16 },
    };
  }
  return {
    label: `${n} años`,
    hr: [60, 100],
    rr: [12, 20],
    sbp: [90, 140],
    dbp: [60, 90],
    spo2: [95, 100],
    temp: [36.1, 37.2],
    rest: { spo2: 97, heartRate: 74, systolic: 122, diastolic: 78, temperature: 36.6, respiratoryRate: 16 },
  };
}

export function rangeText(pair, unit = "") {
  return `${pair[0]} a ${pair[1]}${unit ? ` ${unit}` : ""}`;
}
