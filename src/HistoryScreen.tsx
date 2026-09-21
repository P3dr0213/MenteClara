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
}: {
  token: string;
  onBack: () => void;
}) {
  const [period, setPeriod] = useState<Period>('week');
  const [entries, setEntries] = useState<Mood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
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
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Histórico de humor</Text>
        <View style={styles.row}>
          {(['week', 'month'] as const).map(value => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: period === value }}
              style={[styles.filter, period === value && styles.selected]}
              onPress={() => setPeriod(value)}
            >
              <Text>
                {value === 'week' ? 'Últimos 7 dias' : 'Últimos 30 dias'}
              </Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator accessibilityLabel="Carregando histórico" />
        ) : error ? (
          <View>
            <Text accessibilityRole="alert">{error}</Text>
            <Pressable
              style={styles.button}
              onPress={() => setReload(value => value + 1)}
            >
              <Text>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : entries.length === 0 ? (
          <Text style={styles.empty}>
            Sem registros neste período. Registre como você está se sentindo
            para começar.
          </Text>
        ) : (
          <>
            <Text style={styles.subtitle}>Intensidade média por dia</Text>
            <Text style={styles.help}>
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
                    <Text>{point.average.toFixed(1)}</Text>
                    <View
                      style={[styles.bar, { height: point.average * 22 }]}
                    />
                    <Text style={styles.date}>{point.label}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            <Text style={styles.subtitle}>Seus registros</Text>
            {entries.map(entry => (
              <View key={entry.id} style={styles.card}>
                <Text style={styles.mood}>
                  {entry.tipo} · intensidade {entry.intensidade}/5
                </Text>
                <Text>{new Date(entry.criado_em).toLocaleString('pt-BR')}</Text>
                {entry.descricao ? (
                  <Text style={styles.description}>{entry.descricao}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
        <Pressable style={styles.button} onPress={onBack}>
          <Text>Voltar</Text>
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
