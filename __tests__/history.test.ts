import { dailyIntensity } from '../src/history';

test('grafico agrupa intensidade por data e ordena cronologicamente', () => {
  const entries = [
    {
      id: '3',
      tipo: 'triste',
      intensidade: 5,
      descricao: null,
      criado_em: '2026-09-21T12:00:00',
    },
    {
      id: '1',
      tipo: 'feliz',
      intensidade: 2,
      descricao: null,
      criado_em: '2026-09-20T12:00:00',
    },
    {
      id: '2',
      tipo: 'ansioso',
      intensidade: 4,
      descricao: null,
      criado_em: '2026-09-20T15:00:00',
    },
  ];
  expect(dailyIntensity(entries).map(point => point.average)).toEqual([3, 5]);
  expect(dailyIntensity([])).toEqual([]);
});
