import { Mood } from './api';

// Agrupa pela data local do aparelho; nao transforma tipos de humor em pontuacoes.
export function dailyIntensity(entries: Mood[]) {
  const days = new Map<string, { sum: number; count: number; label: string }>();
  entries.forEach(entry => {
    const date = new Date(entry.criado_em);
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
    const current = days.get(day) || {
      sum: 0,
      count: 0,
      label: date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
    };
    current.sum += entry.intensidade;
    current.count += 1;
    days.set(day, current);
  });
  return Array.from(days.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, value]) => ({
      day,
      label: value.label,
      average: value.sum / value.count,
    }));
}
