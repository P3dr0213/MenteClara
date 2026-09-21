const DIARY_PROMPTS = [
  'Como você está se sentindo hoje?',
  'O que mais te preocupou hoje?',
  'O que te ajudou a se acalmar?',
  'Qual momento do dia merece atenção?',
  'O que você quer lembrar de si mesmo hoje?',
];

function normalizeDiaryEntry(input = {}) {
  const usePrompt =
    input.usePrompt !== false && String(input.prompt || '').trim().length > 0;
  const prompt = usePrompt ? String(input.prompt || '').trim() : '';
  const resposta = String(input.resposta || '').trim();

  return {
    usePrompt,
    prompt,
    resposta,
  };
}

function validateDiaryEntry(input = {}) {
  const normalized = normalizeDiaryEntry(input);
  const errors = {};

  if (normalized.usePrompt && normalized.prompt.length > 255) {
    errors.prompt = 'A pergunta do diário deve ter no máximo 255 caracteres.';
  }

  if (!normalized.resposta || normalized.resposta.length < 10) {
    errors.resposta = 'O texto do diário deve ter ao menos 10 caracteres.';
  }

  if (normalized.resposta.length > 5000) {
    errors.resposta = 'O diário deve ter no máximo 5000 caracteres.';
  }

  if (normalized.usePrompt && normalized.prompt.length > 255) {
    errors.prompt = 'A pergunta do diário deve ter no máximo 255 caracteres.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  DIARY_PROMPTS,
  normalizeDiaryEntry,
  validateDiaryEntry,
};
