const {
  validateRegisterForm,
  validateLoginForm,
  normalizeEmail,
} = require('../src/auth');

describe('autenticação', () => {
  test('normaliza email para lowercase', () => {
    expect(normalizeEmail('Maria@Teste.com')).toBe('maria@teste.com');
  });

  test('aceita cadastro válido', () => {
    const result = validateRegisterForm({
      name: 'Maria Souza',
      email: 'maria@teste.com',
      password: 'Senha@123',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('rejeita cadastro com dados inválidos', () => {
    const result = validateRegisterForm({
      name: 'A',
      email: 'email-invalido',
      password: '123',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/mínimo/i);
    expect(result.errors.email).toMatch(/válido/i);
    expect(result.errors.password).toMatch(/mínimo|forte/i);
  });

  test('valida login com email e senha', () => {
    const valid = validateLoginForm({
      email: 'joao@teste.com',
      password: 'Senha@123',
    });
    const invalid = validateLoginForm({ email: '', password: '123' });

    expect(valid.valid).toBe(true);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.email).toMatch(/obrigatório|válido/i);
    expect(
      validateLoginForm({ email: 'a@b.com', password: '' }).errors.password,
    ).toMatch(/obrigatória/i);
  });
});
