const { validateMoodEntry, normalizeMoodEntry } = require('../src/mood');

describe('registro de humor', () => {
  test('normaliza dados do humor', () => {
    const result = normalizeMoodEntry({
      tipo: ' Feliz ',
      intensidade: '4',
      descricao: '  Me senti melhor hoje  ',
    });

    expect(result.tipo).toBe('feliz');
    expect(result.intensidade).toBe(4);
    expect(result.descricao).toBe('Me senti melhor hoje');
  });

  test('aceita registro válido', () => {
    const result = validateMoodEntry({
      tipo: 'feliz',
      intensidade: 4,
      descricao: 'Passei bem no dia hoje.',
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test('rejeita humor inválido', () => {
    const result = validateMoodEntry({
      tipo: 'inexistente',
      intensidade: 9,
      descricao: 'x'.repeat(400),
    });

    expect(result.valid).toBe(false);
    expect(result.errors.tipo).toMatch(/válido|tipo/i);
    expect(result.errors.intensidade).toMatch(/entre|intensidade/i);
    expect(result.errors.descricao).toMatch(/máximo|descrição/i);
  });
});
