/** Guess form fields from the Spanish story when the LLM is down. */
export function guessFromStory(story) {
  const text = String(story || "").trim();
  const t = text.toLowerCase();
  const ageMatch = t.match(/(\d{1,3})\s*años/);
  const age = ageMatch ? Number(ageMatch[1]) : null;
  let sex = "";
  if (/señora|mujer|niña|embaraz|gestante/.test(t)) sex = "F";
  else if (/señor|hombre|niño(?!a)/.test(t)) sex = "M";

  let conditionId = "cura";
  if (/no responde|desmay|no respira/.test(t)) conditionId = "paro";
  else if (/derrame|boca torcida|no habla|cara.*rara/.test(t)) conditionId = "avc";
  else if (/pecho/.test(t)) conditionId = "sca";
  else if (/choque|caída de altura|caida de altura|politrauma/.test(t)) conditionId = "trauma";
  else if (/ahogo|no puede respir|falta de aire/.test(t)) conditionId = "disnea";
  else if (/hinchazón de cara|hinchazon de cara|lengua hinch|sibilanc/.test(t)) conditionId = "anafilaxia";
  else if (/convuls/.test(t)) conditionId = "convulsion";
  else if (/sangrado que no|sangra mucho/.test(t)) conditionId = "hemorragia";
  else if (/picadura|abeja|avispa|grano|piel|ojo/.test(t)) conditionId = "cura";
  else if (/quemadur/.test(t)) conditionId = "quemadura";
  else if (/cabeza|jaqueca/.test(t)) conditionId = "cefalea";
  else if (/fiebre|calentura/.test(t)) conditionId = "fiebre";
  else if (/vómito|vomito|diarrea/.test(t)) conditionId = "gi";

  const pregnant = /embaraz|gestante/.test(t);
  return {
    active: true,
    age,
    sex,
    conditionId,
    reason: text.slice(0, 200),
    pregnant,
    notes: ["Se armó con el relato porque la IA no contestó. Revise el motivo y tome los signos."],
  };
}
