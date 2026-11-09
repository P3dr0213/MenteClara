export type MoodNote = { tipo: string; intensidade: number; descricao: string | null };

export type SentimentLabel = 'positive' | 'negative' | 'mixed' | 'insufficient';

export type SentimentSummary = {
  analyzed: number;
  positive: number;
  negative: number;
  mixed: number;
};

const positiveWords = new Set([
  'bem', 'feliz', 'alegre', 'contente', 'animado', 'animada', 'motivado', 'motivada',
  'calmo', 'calma', 'tranquilo', 'tranquila', 'leve', 'grato', 'grata', 'gratidao',
  'esperanca', 'esperancoso', 'esperancosa', 'confiante', 'orgulho', 'aliviado',
  'aliviada', 'consegui', 'melhor', 'bom', 'boa', 'otimo', 'otima', 'bem-estar',
]);

const negativeWords = new Set([
  'mal', 'triste', 'ansioso', 'ansiosa', 'preocupado', 'preocupada', 'estressado',
  'estressada', 'cansado', 'cansada', 'exausto', 'exausta', 'sozinho', 'sozinha',
  'sobrecarregado', 'sobrecarregada', 'frustrado', 'frustrada', 'irritado', 'irritada',
  'medo', 'angustiado', 'angustiada', 'desanimado', 'desanimada', 'dificil', 'pessimo',
  'pessima', 'horrivel', 'vazio', 'vazia', 'dor', 'sofrendo', 'chateado', 'chateada',
]);

const negators = new Set(['nao', 'nunca', 'nem', 'sem']);

function normalizeWords(text: string) {
  return text
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z]+(?:-[a-z]+)?/g) || [];
}

export function analyzeSentiment(text: string): SentimentLabel {
  const words = normalizeWords(text);
  let positive = 0;
  let negative = 0;

  words.forEach((word, index) => {
    const negated = words.slice(Math.max(0, index - 3), index).some(item => negators.has(item));
    if (negated) return;
    if (positiveWords.has(word)) positive += 1;
    if (negativeWords.has(word)) negative += 1;
  });

  if (!positive && !negative) return 'insufficient';
  if (positive && negative) return 'mixed';
  return positive ? 'positive' : 'negative';
}

export function summarizeMoodNotes(entries: MoodNote[]): SentimentSummary {
  const summary: SentimentSummary = { analyzed: 0, positive: 0, negative: 0, mixed: 0 };
  entries.forEach(entry => {
    const note = entry.descricao?.trim();
    if (!note) return;
    const label = analyzeSentiment(note);
    if (label === 'insufficient') return;
    summary.analyzed += 1;
    summary[label] += 1;
  });
  return summary;
}

export type ActivityRecommendation = {
  title: string;
  explanation: string;
  activity: 'respiracao' | 'gratidao' | 'pausa';
};

export function recommendActivity(entries: MoodNote[], sentiments: SentimentSummary): ActivityRecommendation {
  const recentDifficultMoods = entries.slice(0, 5).filter(entry =>
    entry.tipo === 'triste' || entry.tipo === 'ansioso',
  ).length;
  const sentimentHasTrend = sentiments.analyzed >= 2;
  const difficultNotes = sentimentHasTrend && sentiments.negative > sentiments.positive;

  if (recentDifficultMoods >= 2 || difficultNotes) {
    return {
      title: 'Respiração guiada',
      explanation: 'Uma pausa breve pode ajudar você a observar como está se sentindo, sem pressa.',
      activity: 'respiracao',
    };
  }
  if (sentimentHasTrend && sentiments.positive > sentiments.negative) {
    return {
      title: 'Gratidão',
      explanation: 'Você pode registrar algo que gostaria de guardar do dia.',
      activity: 'gratidao',
    };
  }
  return {
    title: 'Pausa consciente',
    explanation: 'Faça uma pausa curta e perceba do que você precisa neste momento.',
    activity: 'pausa',
  };
}
