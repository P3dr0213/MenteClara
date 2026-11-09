import React, { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  loadWellbeing,
  saveWellbeing,
  WellbeingGoal,
  WellbeingState,
  reconcileWellbeing,
  wellbeingPayload,
} from './wellbeing';
import { api, ApiError } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function clearDailyReminder() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled
    .filter(request => request.content.data?.kind === 'mente-clara-mood-reminder')
    .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

async function scheduleDailyReminder(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  await clearDailyReminder();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: 'Um momento para você',
      body: 'Como você está se sentindo? Registre seu humor ou escolha uma prática de bem-estar.',
      data: { kind: 'mente-clara-mood-reminder' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

type Props = {
  userId: string;
  token: string;
  darkMode: boolean;
  onThemeChange: () => void;
  onBreathing: () => void;
};

const articles = [
  { title: 'Nomear o que você sente', text: 'Dar nome às emoções pode ajudar a perceber necessidades e escolher como agir. Experimente descrever o sentimento sem se julgar.' },
  { title: 'Pequenas pausas', text: 'Pausas curtas para alongar, respirar ou beber água podem ajudar a dividir um dia intenso em momentos mais manejáveis.' },
  { title: 'Sono e bem-estar', text: 'Uma rotina regular e um período tranquilo antes de dormir podem apoiar o descanso. Se as dificuldades persistirem, procure orientação profissional.' },
  { title: 'Gratidão sem cobrança', text: 'Você pode registrar algo que apreciou hoje, mesmo que seja pequeno. Não é necessário se sentir positivo o tempo todo.' },
];

const activities = [
  { id: 'gratidao', title: 'Gratidão', detail: 'Anote uma coisa que você gostaria de guardar do dia.' },
  { id: 'pausa', title: 'Pausa consciente', detail: 'Afaste-se por alguns minutos e observe como está se sentindo.' },
  { id: 'alongamento', title: 'Alongamento leve', detail: 'Faça movimentos confortáveis, respeitando os limites do seu corpo.' },
];

const practices = [
  { id: 'respiracao', title: 'Respiração guiada', detail: 'Inspire por 4 segundos, segure por 4 e expire por 6.', action: true },
  { id: 'aterramento', title: 'Aterramento 5–4–3–2–1', detail: 'Perceba 5 coisas que vê, 4 que sente pelo toque, 3 que ouve, 2 cheiros e 1 sabor.' },
  { id: 'pausa-corporal', title: 'Pausa corporal', detail: 'Observe os pés, pernas, ombros e rosto, soltando a tensão apenas se for confortável.' },
];

export default function SprintTwoScreen({ userId, token, darkMode, onThemeChange, onBreathing }: Props) {
  const [data, setData] = useState<WellbeingState | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('7');
  const [reminderTime, setReminderTime] = useState('20:00');
  const [selectedArticle, setSelectedArticle] = useState<number | null>(null);
  const [notificationNotice, setNotificationNotice] = useState('');
  const [tab, setTab] = useState<'rotina' | 'conteudos' | 'praticas' | 'metas' | 'conquistas'>('rotina');
  const theme = darkMode
    ? { background: '#101827', surface: '#1f2937', text: '#f3f4f6', muted: '#cbd5e1', border: '#334155', accent: '#3fbf9f', soft: '#1f3b35' }
    : { background: '#f3f5f7', surface: '#ffffff', text: '#1f2d2d', muted: '#5d6668', border: '#dfe8eb', accent: '#2d7a67', soft: '#eaf8f2' };

  useEffect(() => {
    let active = true;
    reconcileWellbeing(userId, token).catch(() => loadWellbeing(userId)).then(async value => {
      if (active) {
        setData(value);
        setReminderTime(value.reminderTime);
        if (value.reminderEnabled) {
          const permission = await Notifications.getPermissionsAsync();
          if (!permission.granted) {
            setNotificationNotice('O lembrete está salvo, mas as notificações estão bloqueadas nas configurações do aparelho.');
          } else {
            await scheduleDailyReminder(value.reminderTime);
          }
        }
      }
    }).catch(() => Alert.alert('Erro', 'Não foi possível carregar suas preferências.'));
    return () => { active = false; };
  }, [userId, token]);

  async function update(change: (current: WellbeingState) => WellbeingState) {
    if (!data) return;
    const next = { ...change(data), updatedAt: new Date().toISOString() };
    setData(next);
    try {
      await saveWellbeing(userId, next);
      const saved = await api.saveWellbeing(token, wellbeingPayload(next));
      await saveWellbeing(userId, saved.state);
      setData(saved.state);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 0)) {
        setData(data);
        Alert.alert('Erro', error instanceof Error ? error.message : 'Não foi possível sincronizar suas alterações.');
        return;
      }
      try {
        await saveWellbeing(userId, next);
        Alert.alert('Salvo neste aparelho', 'A alteração será sincronizada quando a conexão retornar.');
      } catch (storageError) {
        setData(data);
        Alert.alert('Erro', storageError instanceof Error ? storageError.message : 'Não foi possível salvar com segurança.');
      }
    }
  }

  async function configureReminder(enabled: boolean) {
    if (!data) return;
    const match = /^(\d{2}):(\d{2})$/.exec(reminderTime);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      Alert.alert('Horário inválido', 'Use o formato 24 horas HH:MM, por exemplo 20:00.');
      return;
    }
    try {
      if (enabled) {
        const permission = await Notifications.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permissão necessária', 'Ative as notificações nas configurações do aparelho para receber lembretes.');
          return;
        }
      }
      if (enabled) {
        setNotificationNotice('');
        await scheduleDailyReminder(reminderTime);
      } else {
        setNotificationNotice('');
        await clearDailyReminder();
      }
      const next = { ...data, reminderEnabled: enabled, reminderTime, updatedAt: new Date().toISOString() };
      setData(next);
      await saveWellbeing(userId, next);
      try {
        const saved = await api.saveWellbeing(token, wellbeingPayload(next));
        await saveWellbeing(userId, saved.state);
        setData(saved.state);
      if (!enabled) setNotificationNotice('');
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 0)) throw error;
        Alert.alert('Lembrete atualizado', 'A preferência foi salva neste aparelho e será sincronizada quando a conexão retornar.');
        return;
      }
      Alert.alert('Lembrete atualizado', enabled ? `Você receberá um lembrete diário às ${reminderTime}.` : 'Lembretes desativados.');
    } catch {
      Alert.alert('Erro', 'Não foi possível configurar o lembrete neste aparelho.');
    }
  }

  function completeActivity(id: string) {
    if (!data || data.completedActivities.includes(id)) return;
    const earned = data.points + 10;
    const badges = earned >= 50 && !data.earnedBadges.includes('constancia')
      ? [...data.earnedBadges, 'constancia']
      : data.earnedBadges;
    update(current => ({ ...current, completedActivities: [...current.completedActivities, id], points: earned, earnedBadges: badges }));
  }

  function addGoal() {
    const title = goalTitle.trim();
    const target = Number(goalTarget);
    if (!title || !Number.isInteger(target) || target < 1 || target > 100) {
      Alert.alert('Meta inválida', 'Informe um nome e uma meta entre 1 e 100.');
      return;
    }
    if (data && data.goals.length >= 30) {
      Alert.alert('Limite de metas', 'Você pode manter até 30 metas salvas.');
      return;
    }
    const goal: WellbeingGoal = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, title, target, progress: 0 };
    update(current => ({ ...current, goals: [...current.goals, goal] }));
    setGoalTitle('');
  }

  function incrementGoal(goal: WellbeingGoal) {
    update(current => ({ ...current, goals: current.goals.map(item => item.id === goal.id ? { ...item, progress: Math.min(item.target, item.progress + 1) } : item) }));
  }

  const actionButton = (label: string, onPress: () => void, secondary = false) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, { backgroundColor: secondary ? theme.soft : theme.accent, borderColor: theme.border }]}>
      <Text style={[styles.buttonText, { color: secondary ? theme.accent : '#ffffff' }]}>{label}</Text>
    </Pressable>
  );

  if (!data) return <View style={[styles.screen, { backgroundColor: theme.background }]}><Text style={{ color: theme.text }}>Carregando seu espaço de bem-estar…</Text></View>;

  const card = (title: string, body: string, trailing?: React.ReactNode) => (
    <View key={title} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>{body}</Text>
      {trailing}
    </View>
  );

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Bem-estar</Text>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Práticas e ferramentas para sua rotina, no seu ritmo.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} accessibilityLabel="Seções de bem-estar">
        {([
          ['rotina', 'Rotina'], ['conteudos', 'Conteúdos'], ['praticas', 'Práticas'], ['metas', 'Metas'], ['conquistas', 'Conquistas'],
        ] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => { setTab(key); setSelectedArticle(null); }} style={[styles.tab, { borderColor: theme.border, backgroundColor: tab === key ? theme.soft : theme.surface }]}><Text style={{ color: tab === key ? theme.accent : theme.text }}>{label}</Text></Pressable>)}
      </ScrollView>

      {tab === 'rotina' && <>
        {card('Lembrete diário', 'Escolha um horário para receber um lembrete local neste aparelho.')}
        {notificationNotice ? <Text accessibilityRole="alert" style={[styles.body, { color: theme.muted, marginBottom: 12 }]}>{notificationNotice}</Text> : null}
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Horário (24 h)</Text>
          <TextInput accessibilityLabel="Horário do lembrete" value={reminderTime} onChangeText={setReminderTime} keyboardType="numbers-and-punctuation" maxLength={5} placeholder="20:00" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
          {actionButton(data.reminderEnabled ? 'Atualizar lembrete' : 'Ativar lembrete diário', () => configureReminder(true))}
          {data.reminderEnabled ? actionButton('Desativar lembrete', () => configureReminder(false), true) : null}
        </View>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Acessibilidade e aparência</Text>
          <Text style={[styles.body, { color: theme.muted }]}>Controles com rótulos para leitor de tela. O tamanho do texto também pode ser ampliado nas configurações do aparelho.</Text>
          {actionButton(darkMode ? 'Ativar tema claro' : 'Ativar tema escuro', onThemeChange, true)}
        </View>
        {card('Pontos de cuidado', `Você acumulou ${data.points} pontos ao concluir práticas. Cada prática vale 10 pontos.`)}
      </>}

      {tab === 'conteudos' && (selectedArticle === null ? articles.map((item, index) => <Pressable key={item.title} accessibilityRole="button" onPress={() => setSelectedArticle(index)}>{card(item.title, item.text + '  Ler conteúdo →')}</Pressable>) : <>
        {card(articles[selectedArticle].title, articles[selectedArticle].text)}
        {actionButton('Voltar aos conteúdos', () => setSelectedArticle(null), true)}
      </>)}

      {tab === 'praticas' && <>
        {activities.map(item => <View key={item.id}>{card(item.title, item.detail, actionButton(data.completedActivities.includes(item.id) ? 'Concluída ✓' : 'Marcar como concluída · +10 pontos', () => completeActivity(item.id), true))}</View>)}
        {practices.map(item => <View key={item.id}>{card(item.title, item.detail, actionButton(item.action ? 'Iniciar respiração guiada' : 'Concluir prática · +10 pontos', () => item.action ? onBreathing() : completeActivity(item.id), true))}</View>)}
      </>}

      {tab === 'metas' && <>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Nova meta de bem-estar</Text>
          <TextInput accessibilityLabel="Nome da meta" value={goalTitle} onChangeText={setGoalTitle} placeholder="Ex.: respirar por alguns minutos" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
          <TextInput accessibilityLabel="Frequência da meta" value={goalTarget} onChangeText={setGoalTarget} keyboardType="number-pad" placeholder="Frequência desejada" placeholderTextColor={theme.muted} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
          {actionButton('Criar meta', addGoal)}
        </View>
        {data.goals.length === 0 ? card('Suas metas', 'Suas metas pessoais aparecerão aqui.') : data.goals.map(goal => <View key={goal.id}>{card(goal.title, `Progresso: ${goal.progress} de ${goal.target}`)}{actionButton(goal.progress >= goal.target ? 'Meta concluída ✓' : 'Registrar progresso', () => incrementGoal(goal), true)}</View>)}
      </>}

      {tab === 'conquistas' && <>
        {card('Seu progresso', `${data.points} pontos · ${data.completedActivities.length} práticas concluídas`)}
        {card('Primeiros passos', data.completedActivities.length ? 'Conquista desbloqueada: você concluiu sua primeira prática.' : 'Conclua uma prática para desbloquear sua primeira conquista.')}
        {card('Constância', data.earnedBadges.includes('constancia') ? 'Conquista desbloqueada: você acumulou 50 pontos.' : 'Acumule 50 pontos em práticas para desbloquear esta conquista.')}
        {data.goals.filter(goal => goal.progress >= goal.target).map(goal => card(`Meta alcançada: ${goal.title}`, 'Parabéns por registrar seu progresso.'))}
      </>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 36 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 18 },
  tabs: { flexDirection: 'row', gap: 8, paddingBottom: 14 },
  tab: { minHeight: 44, paddingHorizontal: 14, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 10, marginBottom: 4, minHeight: 48 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, marginTop: 10 },
  buttonText: { fontWeight: '700', fontSize: 15 },
});
