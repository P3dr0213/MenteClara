import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const questions = [
  'Como você percebe seu descanso hoje?',
  'Como você percebe sua energia hoje?',
  'Como você percebe seu tempo para cuidar de si hoje?',
  'Como você percebe sua conexão com outras pessoas hoje?',
];
const options = [
  'Muito insatisfatório',
  'Insatisfatório',
  'Regular',
  'Satisfatório',
  'Muito satisfatório',
];

type Props = { darkMode: boolean; onBack: () => void; onHelp: () => void };

export default function AssessmentScreen({ darkMode, onBack, onHelp }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null),
  );
  const [showResult, setShowResult] = useState(false);
  const [error, setError] = useState('');
  const colors = darkMode
    ? {
        background: '#101827',
        surface: '#1f2937',
        text: '#f3f4f6',
        muted: '#cbd5e1',
        accent: '#3fbf9f',
        selected: '#1f3b35',
        border: '#64748b',
        error: '#fca5a5',
      }
    : {
        background: '#f3f5f7',
        surface: '#ffffff',
        text: '#1f2d2d',
        muted: '#5d6668',
        accent: '#2d7a67',
        selected: '#eaf8f2',
        border: '#82918d',
        error: '#b3261e',
      };
  const answered = answers.filter(answer => answer !== null).length;
  const action = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.action, { borderColor: colors.accent }]}
    >
      <Text style={[styles.actionText, { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <ScrollView
        key={showResult ? 'result' : 'questions'}
        contentContainerStyle={styles.content}
      >
        {action('Voltar ao início', onBack)}
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {showResult ? 'Seu resumo de hoje' : 'Autoavaliação de bem-estar'}
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>
          Esta é uma reflexão pessoal, não um teste clínico validado. Não é
          diagnóstico e não substitui atendimento profissional.
        </Text>
        <Text style={[styles.text, { color: colors.muted }]}>
          As respostas não são salvas. Ao sair desta tela, elas serão
          descartadas.
        </Text>
        {showResult ? (
          <>
            <Text style={[styles.text, { color: colors.text }]}>
              Este resumo reúne suas percepções de hoje, sem atribuir uma nota à
              sua saúde mental.
            </Text>
            {questions.map((question, index) => (
              <View
                key={question}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text style={[styles.question, { color: colors.text }]}>
                  {question}
                </Text>
                <Text style={[styles.text, { color: colors.text }]}>
                  {options[answers[index]!]}
                </Text>
              </View>
            ))}
            {action('Revisar respostas', () => setShowResult(false))}
            {action('Refazer autoavaliação', () => {
              setAnswers(questions.map(() => null));
              setError('');
              setShowResult(false);
            })}
            {action('Concluir', onBack)}
          </>
        ) : (
          <>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.text, { color: colors.muted }]}
            >
              {answered} de {questions.length} perguntas respondidas
            </Text>
            {questions.map((question, index) => (
              <View
                key={question}
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  accessibilityRole="header"
                  style={[styles.question, { color: colors.text }]}
                >
                  {question}
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  accessibilityLabel={question}
                >
                  {options.map((option, value) => (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityLabel={`${question} ${option}`}
                      accessibilityState={{ checked: answers[index] === value }}
                      onPress={() => {
                        setAnswers(current =>
                          current.map((answer, position) =>
                            position === index ? value : answer,
                          ),
                        );
                        setError('');
                      }}
                      style={[
                        styles.option,
                        {
                          borderColor:
                            answers[index] === value
                              ? colors.accent
                              : colors.border,
                          backgroundColor:
                            answers[index] === value
                              ? colors.selected
                              : colors.surface,
                        },
                      ]}
                    >
                      <Text style={[styles.text, { color: colors.text }]}>
                        {answers[index] === value ? '● ' : '○ '}
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
            {error ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                style={[styles.text, { color: colors.error }]}
              >
                {error}
              </Text>
            ) : null}
            {action('Ver resultado', () => {
              if (answered !== questions.length) {
                setError('Responda todas as perguntas para ver seu resumo.');
                return;
              }
              setError('');
              setShowResult(true);
            })}
          </>
        )}
        {action('Acessar ajuda', onHelp)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 26, fontWeight: '700' },
  text: { fontSize: 16, lineHeight: 24 },
  question: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  card: { padding: 16, borderRadius: 16, borderWidth: 1 },
  option: {
    minHeight: 48,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    justifyContent: 'center',
  },
  action: {
    minHeight: 48,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 16, fontWeight: '600' },
});
