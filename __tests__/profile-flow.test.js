const {
  normalizeProfileInput,
  validateProfileUpdateForm,
} = require('../src/auth');

describe('perfil', () => {
  test('normaliza nome e email do perfil', () => {
    const result = normalizeProfileInput({
      name: '  Maria Souza  ',
      email: ' MARIA@TESTE.COM ',
    });

    expect(result.name).toBe('Maria Souza');
    expect(result.email).toBe('maria@teste.com');
  });

  test('aceita dados válidos para perfil', () => {
    const result = validateProfileUpdateForm({
      name: 'Maria Souza',
      email: 'maria@teste.com',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('rejeita perfil inválido', () => {
    const result = validateProfileUpdateForm({
      name: 'A',
      email: 'email-invalido',
    });

    expect(result.valid).toBe(false);
    expect(result.errors.name).toMatch(/mínimo/i);
    expect(result.errors.email).toMatch(/válido/i);
  });
});
