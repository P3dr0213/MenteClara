const MOOD_TYPES = ['triste', 'ansioso', 'feliz', 'calmo', 'motivado'];

function normalizeMoodEntry(input = {}) {
  const tipo = String(input.tipo || '')
    .trim()
    .toLowerCase();
  const intensidade = Number(input.intensidade ?? 0);
  const descricao = String(input.descricao || '').trim();

  return {
    tipo,
    intensidade: Number.isFinite(intensidade) ? intensidade : 0,
    descricao,
  };
}

function validateMoodEntry(input = {}) {
  const normalized = normalizeMoodEntry(input);
  const errors = {};

  if (!normalized.tipo || !MOOD_TYPES.includes(normalized.tipo)) {
    errors.tipo = 'Tipo de humor inválido. Selecione uma opção válida.';
  }

  if (
    (typeof input.intensidade !== 'number' &&
      typeof input.intensidade !== 'string') ||
    !Number.isInteger(normalized.intensidade) ||
    normalized.intensidade < 1 ||
    normalized.intensidade > 5
  ) {
    errors.intensidade = 'Intensidade deve estar entre 1 e 5.';
  }

  if (
    (input.descricao != null && typeof input.descricao !== 'string') ||
    normalized.descricao.length > 280
  ) {
    errors.descricao = 'Descrição deve ter no máximo 280 caracteres.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized,
  };
}

module.exports = {
  MOOD_TYPES,
  normalizeMoodEntry,
  validateMoodEntry,
};
