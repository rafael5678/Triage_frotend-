import { FEATURES, generateDataset, toFeatures, news2Score } from "./dataset";
import { CONDITIONS } from "./conditions";

function fitStump(rows, residual) {
  let best = { feat: FEATURES[0], thr: 0, left: 0, right: 0, err: Infinity };
  for (const feat of FEATURES) {
    const vals = [...new Set(rows.map((x) => x[feat]))].sort((a, b) => a - b);
    const step = Math.max(1, Math.floor(vals.length / 8));
    for (let i = 0; i < vals.length; i += step) {
      const thr = vals[i];
      let sumLeft = 0, nLeft = 0, sumRight = 0, nRight = 0;
      rows.forEach((x, k) => {
        if (x[feat] <= thr) {
          sumLeft += residual[k];
          nLeft++;
        } else {
          sumRight += residual[k];
          nRight++;
        }
      });
      if (!nLeft || !nRight) continue;
      const left = sumLeft / nLeft;
      const right = sumRight / nRight;
      let err = 0;
      rows.forEach((x, k) => {
        const pred = x[feat] <= thr ? left : right;
        err += (residual[k] - pred) ** 2;
      });
      if (err < best.err) best = { feat, thr, left, right, err };
    }
  }
  return best;
}

function stumpPredict(tree, x) {
  return x[tree.feat] <= tree.thr ? tree.left : tree.right;
}

export function trainBoost(rows, rounds = 20, learningRate = 0.16) {
  const xs = rows.map(toFeatures);
  const y = rows.map((r) => r.y);
  const pred = y.map(() => y.reduce((a, b) => a + b, 0) / y.length);
  const trees = [];
  const bias = pred[0];
  for (let r = 0; r < rounds; r++) {
    const residual = y.map((yi, i) => yi - pred[i]);
    const stump = fitStump(xs, residual);
    trees.push(stump);
    xs.forEach((x, i) => {
      pred[i] += learningRate * stumpPredict(stump, x);
    });
  }
  return { trees, lr: learningRate, bias };
}

export function predictScore(model, row) {
  const x = toFeatures(row);
  let p = model.bias;
  for (const t of model.trees) p += model.lr * stumpPredict(t, x);
  const spo2 = Number(row.spo2);
  const sbp = Number(row.systolic ?? row.pas);
  const rr = Number(row.respiratoryRate ?? row.fr);
  const hr = Number(row.heartRate ?? row.fc);
  const dbp = Number(row.diastolic ?? row.pad);
  if (spo2 < 85 || sbp < 80 || rr < 8 || hr > 150 || hr < 40) p = Math.max(p, 86);
  if (hr > 0 && hr < 50) p = Math.max(p, 62);
  if (sbp >= 180 || dbp >= 120) p = Math.max(p, 42);
  if (sbp >= 200) p = Math.max(p, 62);
  if ((row.conditionId || row.lesionId) === "paro") p = Math.max(p, 97);
  return Math.min(100, Math.max(0, Math.round(p * 10) / 10));
}

export function priorityFromScore(score) {
  if (score >= 78) return { id: "I", name: "Reanimación", tone: "i", esi: "ESI I", chip: "Crítica", meaning: "Hay que atenderlo ya: el cuerpo está en peligro inmediato." };
  if (score >= 62) return { id: "II", name: "Emergencia", tone: "ii", esi: "ESI II", chip: "Alta", meaning: "No puede esperar mucho: el riesgo es alto y debe ir adelante en la cola." };
  if (score >= 42) return { id: "III", name: "Urgente", tone: "iii", esi: "ESI III", chip: "Media", meaning: "Necesita atención pronto, pero hay casos más graves primero." };
  if (score >= 22) return { id: "IV", name: "Menos urgente", tone: "iv", esi: "ESI IV", chip: "Baja", meaning: "Puede esperar un rato; no parece un riesgo vital ahora." };
  return { id: "V", name: "No urgente", tone: "v", esi: "ESI V", chip: "Mínima", meaning: "Es el menos grave de la sala con los datos actuales." };
}

export function featureContributions(model, row) {
  const labels = {
    age: "Edad",
    heartRate: "Latidos del corazón",
    spo2: "Oxígeno en la sangre",
    systolic: "Presión alta (sistólica)",
    diastolic: "Presión baja (diastólica)",
    temperature: "Temperatura",
    respiratoryRate: "Respiraciones por minuto",
    comorbidity: "Enfermedades que ya tenía",
    condition: "Qué le ocurre ahora",
  };
  const predicted = predictScore(model, row);
  const baselines = {
    age: 40,
    heartRate: 75,
    spo2: 98,
    systolic: 120,
    diastolic: 80,
    temperature: 36.6,
    respiratoryRate: 16,
  };
  return FEATURES.map((feat) => {
    if (feat === "news" || feat === "shock") return null;
    const alt = { ...row };
    if (feat === "condition") alt.conditionId = "cura";
    else if (feat === "comorbidity") alt.comorbidityIds = [];
    else alt[feat] = baselines[feat];
    const without = predictScore(model, alt);
    return { id: feat, name: labels[feat] || feat, weight: Math.round((predicted - without) * 10) / 10 };
  })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight));
}

export function evaluateModel(model, test) {
  const err = test.map((r) => Math.abs(predictScore(model, r) - r.y));
  const mae = err.reduce((a, b) => a + b, 0) / err.length;
  return { mae: Math.round(mae * 10) / 10, n: test.length };
}

export function featureImportance(model) {
  const counts = Object.fromEntries(FEATURES.map((f) => [f, 0]));
  model.trees.forEach((t) => {
    counts[t.feat] += 1;
  });
  const total = model.trees.length || 1;
  return FEATURES.map((f) => ({ feature: f, percent: Math.round((counts[f] / total) * 100) })).sort((a, b) => b.percent - a.percent);
}

let cache;
export function getModel() {
  if (cache) return cache;
  const data = generateDataset(140);
  const train = data.slice(0, 112);
  const test = data.slice(112);
  const model = trainBoost(train);
  cache = {
    model,
    data,
    train,
    test,
    metrics: evaluateModel(model, test),
    importance: featureImportance(model),
    conditions: CONDITIONS,
  };
  return cache;
}

export { news2Score as news2 };
