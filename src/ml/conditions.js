/* English: identifiers in this file are English; on-screen copy stays Spanish. */
/** Clinical catalog. `label` / `hint` are Spanish (UI). ids are English-stable keys. */
export const CONDITIONS = [
  { id: "paro", label: "Se desmayó o no responde", hint: "No habla, no se mueve o no respira bien. Atención inmediata.", severity: 99 },
  { id: "avc", label: "Cara, brazo o habla de pronto rara (posible derrame)", hint: "Boca torcida, un lado débil o no puede hablar claro.", severity: 94 },
  { id: "sca", label: "Dolor fuerte en el pecho", hint: "Presión o dolor en el pecho, a veces al brazo o mandíbula.", severity: 88 },
  { id: "trauma", label: "Golpe o accidente fuerte", hint: "Caída de altura, choque o herida grave.", severity: 90 },
  { id: "disnea", label: "Le cuesta mucho respirar", hint: "Ahogo, no puede terminar una frase o usa los hombros para respirar.", severity: 82 },
  { id: "sepsis", label: "Infección que lo ve muy mal", hint: "Fiebre con palidez, confusión o se siente muy débil.", severity: 80 },
  { id: "anafilaxia", label: "Alergia grave", hint: "Hinchazón de cara/lengua, sibilancias o ronchas con malestar intenso.", severity: 86 },
  { id: "hemorragia", label: "Sangrado que no para", hint: "Sangre que sigue saliendo y no se controla con presión.", severity: 84 },
  { id: "convulsion", label: "Convulsión (temblor de todo el cuerpo)", hint: "Movimientos que no puede controlar, hace poco.", severity: 70 },
  { id: "abdomen", label: "Dolor fuerte de panza", hint: "Dolor de estómago o abdomen que no es un malestar leve.", severity: 52 },
  { id: "quemadura", label: "Quemadura", hint: "Piel quemada por fuego, líquido caliente o químico.", severity: 48 },
  { id: "fractura", label: "Hueso lastimado o torcedura fuerte", hint: "Dolor al mover, hinchazón o no puede apoyar.", severity: 38 },
  { id: "cefalea", label: "Dolor de cabeza", hint: "Jaqueca o dolor de cabeza sin otros signos graves.", severity: 26 },
  { id: "fiebre", label: "Fiebre, pero se ve estable", hint: "Calentura sin ahogo ni confusión.", severity: 24 },
  { id: "gi", label: "Diarrea, vómito o malestar de estómago", hint: "Síntomas digestivos sin desmayo ni sangrado.", severity: 18 },
  { id: "cura", label: "Herida pequeña o curación", hint: "Corte menor, puntos o cambio de vendaje.", severity: 8 },
];

export const COMORBIDITIES = [
  { id: "iam", label: "Ya tuvo un infarto o tiene corazón enfermo", weight: 10 },
  { id: "icc", label: "El corazón le falla (se hinchan pies o se ahoga al caminar)", weight: 9 },
  { id: "epoc", label: "Pulmón dañado o asma fuerte (EPOC)", weight: 8 },
  { id: "erc", label: "Riñones enfermos", weight: 7 },
  { id: "dm", label: "Diabetes (azúcar alta)", weight: 4 },
  { id: "hta", label: "Presión alta", weight: 3 },
  { id: "cancer", label: "Cáncer en tratamiento", weight: 6 },
  { id: "inmuno", label: "Defensas bajas (quimio, trasplante, VIH, etc.)", weight: 7 },
];


