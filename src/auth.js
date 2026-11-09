const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const text = value => (typeof value === 'string' ? value : '');
function normalizeEmail(value = '') {
  return text(value).trim().toLowerCase();
}
function passwordBytes(value) {
  return Array.from(value).reduce((n, char) => {
    const code = char.codePointAt(0);
    return n + (code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4);
  }, 0);
}
function normalizeProfileInput(input = {}) {
  return {
    name: text(input?.name).trim(),
    email: normalizeEmail(input?.email),
  };
}
function validateProfileUpdateForm(input = {}) {
  const normalized = normalizeProfileInput(input);
  const errors = {};
  if (normalized.name.length < 2 || normalized.name.length > 120) {
    errors.name = 'Nome deve ter no mínimo 2 e no máximo 120 caracteres.';
  }
  if (
    !normalized.email ||
    normalized.email.length > 254 ||
    !EMAIL_REGEX.test(normalized.email)
  ) {
    errors.email = 'Informe um email válido com até 254 caracteres.';
  }
  return { valid: Object.keys(errors).length === 0, errors, normalized };
}
function validateRegisterForm(input = {}) {
  const result = validateProfileUpdateForm(input);
  const password = text(input?.password);
  if (passwordBytes(password) > 72) {
    result.errors.password = 'Senha muito longa. Use uma senha mais curta.';
  } else if (!PASSWORD_REGEX.test(password)) {
    result.errors.password =
      'Senha deve ter no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.';
  }
  return {
    ...result,
    valid: Object.keys(result.errors).length === 0,
    normalized: { ...result.normalized, password },
  };
}
function validateLoginForm(input = {}) {
  const email = normalizeEmail(input?.email);
  const password = text(input?.password);
  const errors = {};
  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    errors.email = 'Informe um email válido.';
  }
  if (!password) {
    errors.password = 'Senha é obrigatória.';
  } else if (passwordBytes(password) > 72) {
    errors.password = 'Senha muito longa. Use uma senha mais curta.';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors,
    normalized: { email, password },
  };
}
module.exports = {
  normalizeEmail,
  normalizeProfileInput,
  validateProfileUpdateForm,
  validateRegisterForm,
  validateLoginForm,
};
