import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, Mood, Period } from './api';
import { dailyIntensity } from './history';

export default function HistoryScreen({
  token,
  onBack,
  darkMode = false,
}: {
  token: string;
  onBack: () => void;
  darkMode?: boolean;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const theme = darkMode
    ? {
        background: '#101827',
        surface: '#1f2937',
        text: '#f3f4f6',
        textMuted: '#cbd5e1',
        border: '#334155',
        accent: '#3fbf9f',
        accentSoft: '#1f3b35',
      }
    : {
        background: '#f3f5f7',
        surface: '#ffffff',
        text: '#1f2d2d',
        textMuted: '#5d6668',
        border: '#dfe8eb',
        accent: '#2f8d72',
        accentSoft: '#dff4ed',
      };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setEntries([]);
    api
      .history(token, period)
      .then(result => {
        if (active) {
          setEntries(result.registros);
        }
      })
      .catch(reason => {
        if (active) {
          setError(reason.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, period, reload]);
  const points = dailyIntensity(entries);
  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { backgroundColor: theme.background },
        ]}
      >
        <Text style={[styles.title, { color: theme.text }]}>
          Histórico de humor
        </Text>
        <View style={styles.row}>
          {(['week', 'month'] as const).map(value => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: period === value }}
              style={[
                styles.filter,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
                period === value && {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
              ]}
              onPress={() => setPeriod(value)}
            >
              <Text style={{ color: theme.text }}>
                {value === 'week' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
              </Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Carregando histórico" />
        ) : error ? (
          <View>
            <Text accessibilityRole="alert" style={{ color: theme.text }}>
              {error}
            </Text>
            <Pressable
              style={[styles.button, { backgroundColor: theme.accentSoft }]}
              onPress={() => setReload(value => value + 1)}
            >
              <Text style={{ color: theme.text }}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textMuted }]}>
            Sem registros neste período. Registre como você está se sentindo
            para começar.
          </Text>
        ) : (
          <>
            <Text style={[styles.subtitle, { color: theme.text }]}>
              Intensidade média por dia
            </Text>
            <Text style={[styles.help, { color: theme.textMuted }]}>
              Escala de 1 a 5. A intensidade não indica se o humor foi positivo
              ou negativo.
            </Text>
            <ScrollView
              horizontal
              accessibilityLabel="Gráfico de intensidade média"
            >
              <View style={styles.chart}>
                {points.map(point => (
                  <View
                    key={point.day}
                    style={styles.column}
                    accessible
                    accessibilityLabel={
                      point.label +
                      ': intensidade média ' +
                      point.average.toFixed(1)
                    }
                  >
                    <Text style={{ color: theme.text }}>
                      {point.average.toFixed(1)}
                    </Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: point.average * 22,
                          backgroundColor: theme.accent,
                        },
                      ]}
                    />
                    <Text style={[styles.date, { color: theme.textMuted }]}>
                      {point.label}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text style={[styles.subtitle, { color: theme.text }]}>
              Seus registros
            </Text>
            {entries.map(entry => (
              <View
                key={entry.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text style={[styles.mood, { color: theme.text }]}>
                  {entry.tipo} · intensidade {entry.intensidade}/5
                </Text>
                <Text style={{ color: theme.textMuted }}>
                  {new Date(entry.criado_em).toLocaleString('pt-BR')}
                </Text>
                {entry.descricao ? (
                  <Text
                    style={[styles.description, { color: theme.textMuted }]}
                  >
                    {entry.descricao}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
        <Pressable
          style={[styles.button, { backgroundColor: theme.accentSoft }]}
          onPress={onBack}
        >
          <Text style={{ color: theme.text }}>Voltar</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 24, paddingBottom: 40 },
  title: {
    fontSize: 27,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#1f2d2d',
    marginVertical: 16,
  },
  row: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  filter: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfe8eb',
  },
  selected: { backgroundColor: '#dff4ed', borderColor: '#2f8d72' },
  button: {
    padding: 15,
    borderRadius: 12,
    backgroundColor: '#dff4ed',
    alignItems: 'center',
    marginTop: 20,
  },
  empty: { color: '#5d6668', lineHeight: 24 },
  help: { color: '#5d6668', marginBottom: 12 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 150,
    paddingTop: 12,
  },
  column: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bar: { width: 24, backgroundColor: '#2f8d72', borderRadius: 5 },
  date: { fontSize: 11, color: '#5d6668' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  mood: { fontWeight: '700', fontSize: 16, color: '#1f2d2d', marginBottom: 6 },
  description: { marginTop: 8, color: '#3e4d4d' },
});
