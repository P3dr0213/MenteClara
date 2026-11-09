import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import {
  ActivityIndicator,
  AppState,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  Linking,
} from 'react-native';
import {
  api,
  ApiError,
  DiaryEntry,
  Session,
  setUnauthorizedHandler,
} from './src/api';
import {
  clearSession,
  getSession,
  getTheme,
  saveSession,
  saveTheme,
} from './src/authStorage';
import {
  validateLoginForm,
  validateRegisterForm,
  validateProfileUpdateForm,
} from './src/auth';
import { validateMoodEntry } from './src/mood';
import { validateDiaryEntry } from './src/diary';
import HistoryScreen from './src/HistoryScreen';
import AssessmentScreen from './src/AssessmentScreen';
import SprintTwoScreen from './src/SprintTwoScreen';
import SprintThreeScreen from './src/SprintThreeScreen';
import FriendsScreen from './src/FriendsScreen';
import { createClientId, getPending, pendingDiary, queueRecord, syncPending, updatePendingMood } from './src/offlineQueue';
import { syncWellbeing } from './src/wellbeing';

type Screen =
  | 'login'
  | 'cadastro'
  | 'home'
  | 'perfil'
  | 'amizades'
  | 'editarPerfil'
  | 'humor'
  | 'historico'
  | 'progresso'
  | 'bemestar'
  | 'autoavaliacao'
  | 'respiracao'
  | 'diario'
  | 'diarioNova'
  | 'diarioDetalhes'
  | 'diarioEditar'
  | 'diarioExcluir'
  | 'emergencia'
  | 'profissionais'
  | 'chatIa';
const moodChoices = [
  { key: 'triste', label: 'Triste', emoji: '😞', light: '#F8ECEF', dark: '#382B32', tone: '#9C5968', darkTone: '#E7B2BE' },
  { key: 'ansioso', label: 'Ansioso', emoji: '😟', light: '#F2EEF8', dark: '#332E3D', tone: '#725C95', darkTone: '#C8B6E4' },
  { key: 'calmo', label: 'Calmo', emoji: '😐', light: '#EDF4F1', dark: '#283833', tone: '#4D7969', darkTone: '#A6D1C0' },
  { key: 'feliz', label: 'Feliz', emoji: '🙂', light: '#FBF3DF', dark: '#3B3528', tone: '#927538', darkTone: '#E6CF92' },
  { key: 'motivado', label: 'Motivado', emoji: '😄', light: '#EAF5ED', dark: '#29382D', tone: '#4F7B59', darkTone: '#AED5B5' },
] as const;
const intensityLabels = ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'];
const breathingPhases = [
  {
    key: 'inhale',
    label: 'Inspire',
    hint: 'por 4 segundos',
    duration: 4,
    scale: 1.28,
  },
  {
    key: 'hold',
    label: 'Segure',
    hint: 'por 4 segundos',
    duration: 4,
    scale: 1.28,
  },
  {
    key: 'exhale',
    label: 'Expire',
    hint: 'por 6 segundos',
    duration: 6,
    scale: 0.9,
  },
] as const;

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Tente novamente.';
}

function formatBreathingTimer(value: number) {
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function MainApp() {
  const [screen, setScreen] = useState<Screen>('home');
  const [session, setSession] = useState<Session | null>(null);
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profileForm, setProfileForm] = useState({ name: '', email: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileReload, setProfileReload] = useState(0);
  const [moodType, setMoodType] = useState('feliz');
  const [intensity, setIntensity] = useState(4);
  const [description, setDescription] = useState('');
  const [editingMoodId, setEditingMoodId] = useState<string | null>(null);
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryText, setDiaryText] = useState('');
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [selectedDiaryEntry, setSelectedDiaryEntry] =
    useState<DiaryEntry | null>(null);
  const [diaryLoading, setDiaryLoading] = useState(false);
  const [diaryMood, setDiaryMood] = useState('bem');
  const diaryMoodOptions = [
    { key: 'triste', emoji: '😞' },
    { key: 'ansioso', emoji: '😟' },
    { key: 'bem', emoji: '🙂' },
    { key: 'feliz', emoji: '😄' },
    { key: 'motivado', emoji: '🤩' },
  ] as const;
  const [breathingPhaseIndex, setBreathingPhaseIndex] = useState(0);
  const [breathingTimeLeft, setBreathingTimeLeft] = useState<number>(
    breathingPhases[0].duration,
  );
  const [isBreathingPaused, setIsBreathingPaused] = useState(false);
  const currentToken = useRef<string | null>(null);
  const breathingScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    getTheme()
      .then(setThemeMode)
      .catch(() => setThemeMode('light'));
  }, []);

  useEffect(() => {
    if (screen !== 'respiracao') {
      breathingScale.setValue(1);
      setBreathingPhaseIndex(0);
      setBreathingTimeLeft(breathingPhases[0].duration);
      setIsBreathingPaused(false);
      return;
    }

    if (isBreathingPaused) {
      return;
    }

    const activePhase = breathingPhases[breathingPhaseIndex];
    const animation = Animated.timing(breathingScale, {
      toValue: activePhase.scale,
      duration: activePhase.duration * 1000,
      useNativeDriver: true,
    });

    animation.start();
    setBreathingTimeLeft(activePhase.duration);

    return () => {
      animation.stop();
    };
  }, [breathingPhaseIndex, breathingScale, isBreathingPaused, screen]);

  useEffect(() => {
    if (screen !== 'respiracao' || isBreathingPaused) {
      return;
    }

    const timer = setInterval(() => {
      setBreathingTimeLeft(currentLeft => {
        if (currentLeft <= 1) {
          setBreathingPhaseIndex(prev => (prev + 1) % breathingPhases.length);
          return 0;
        }
        return currentLeft - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isBreathingPaused, screen]);

  useEffect(() => {
    if (screen !== 'respiracao') {
      return;
    }

    const nextPhase = breathingPhases[breathingPhaseIndex];
    setBreathingTimeLeft(nextPhase.duration);
  }, [breathingPhaseIndex, screen]);

  const resetSession = useCallback(async () => {
    await clearSession();
    currentToken.current = null;
    setSession(null);
    setName('');
    setEmail('');
    setPassword('');
    setProfileForm({ name: '', email: '' });
    setDescription('');
    setMoodType('feliz');
    setIntensity(4);
    setDiaryEntries([]);
    setSelectedDiaryEntry(null);
    setDiaryTitle('');
    setDiaryText('');
    setDiaryMood('bem');
    setDiaryLoading(false);
    setScreen('login');
  }, []);
  const acceptSession = useCallback(async (next: Session) => {
    await saveSession(next);
    currentToken.current = next.token;
    setSession(next);
    setProfileForm({ name: next.user.nome, email: next.user.email });
  }, []);
  const restoreSession = useCallback(async () => {
    setBooting(true);
    setBootError('');
    let stored: Session | null = null;
    try {
      stored = await getSession();
      if (stored) {
        const result = await api.profile(stored.token);
        await acceptSession({ token: stored.token, user: result.user });
        setScreen('home');
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await resetSession();
      } else if (stored && error instanceof ApiError && error.status === 0) {
        await acceptSession(stored);
        setScreen('home');
      } else {
        setBootError(message(error));
      }
    } finally {
      setBooting(false);
    }
  }, [acceptSession, resetSession]);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);
  useEffect(() => {
    if (!session?.user.id || !session.token) return;
    const userId = session.user.id;
    const token = session.token;
    const syncIfConnected = () => {
      Network.getNetworkStateAsync().then(state => {
        if (state.isConnected && state.isInternetReachable !== false) {
          syncPending(userId, token).catch(() => undefined);
          syncWellbeing(userId, token).catch(() => undefined);
        }
      }).catch(() => undefined);
    };
    syncIfConnected();
    const appSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') syncIfConnected();
    });
    const networkSubscription = Network.addNetworkStateListener(state => {
      if (state.isConnected && state.isInternetReachable !== false) syncIfConnected();
    });
    return () => {
      appSubscription.remove();
      networkSubscription.remove();
    };
  }, [session?.user.id, session?.token]);
  useEffect(() => {
    setUnauthorizedHandler(token => {
      if (token === currentToken.current) {
        resetSession().catch(() =>
          Alert.alert('Erro', 'Não foi possível limpar a sessão.'),
        );
        Alert.alert('Sessão encerrada', 'Entre novamente para continuar.');
      }
    });
    return () => setUnauthorizedHandler();
  }, [resetSession]);
  useEffect(() => {
    if (screen !== 'perfil' || !session?.token) {
      return;
    }
    let active = true;
    const token = session.token;
    setProfileLoading(true);
    setProfileError('');
    api
      .profile(token)
      .then(result => {
        if (active && currentToken.current === token) {
          setSession(current =>
            current ? { ...current, user: result.user } : null,
          );
        }
      })
      .catch(error => {
        if (active) {
          setProfileError(message(error));
        }
      })
      .finally(() => {
        if (active) {
          setProfileLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [screen, session?.token, profileReload]);

  useEffect(() => {
    if (screen !== 'diario' || !session?.token) {
      return;
    }
    let active = true;
    setDiaryLoading(true);
    const token = session.token;
    api
      .diaryHistory(token)
      .then(result => {
        if (active && currentToken.current === token) {
          getPending(session.user.id).then(pending => {
            if (!active || currentToken.current !== token) return;
            const offline = pending.map(pendingDiary).filter((entry): entry is DiaryEntry => entry !== null);
            setDiaryEntries([...offline, ...result.registros]);
          });
        }
      })
      .catch(error => {
        if (active) {
          getPending(session.user.id).then(pending => {
            if (!active) return;
            const offline = pending.map(pendingDiary).filter((entry): entry is DiaryEntry => entry !== null);
            setDiaryEntries(offline);
            if (!offline.length) Alert.alert('Erro', message(error));
          });
        }
      })
      .finally(() => {
        if (active) {
          setDiaryLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [screen, session?.user.id, session?.token]);

  async function authenticate() {
    const validation =
      screen === 'cadastro'
        ? validateRegisterForm({ name, email, password })
        : validateLoginForm({ email, password });
    if (!validation.valid) {
      Alert.alert('Validação', String(Object.values(validation.errors)[0]));
      return;
    }
    setLoading(true);
    try {
      const result =
        screen === 'cadastro'
          ? await api.register({ name: name.trim(), ...validation.normalized })
          : await api.login(validation.normalized);
      await acceptSession(result);
      setName('');
      setEmail('');
      setPassword('');
      setScreen('home');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }
  async function logout() {
    if (!session) {
      return;
    }
    setLoading(true);
    try {
      try {
        await api.logout(session.token);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 401)) {
          throw error;
        }
      }
      await resetSession();
    } catch (error) {
      Alert.alert('Não foi possível sair', message(error));
    } finally {
      setLoading(false);
    }
  }
  async function saveProfile() {
    const validation = validateProfileUpdateForm(profileForm);
    if (!validation.valid) {
      Alert.alert('Validação', String(Object.values(validation.errors)[0]));
      return;
    }
    if (!session) {
      return;
    }
    const token = session.token;
    setLoading(true);
    try {
      const result = await api.updateProfile(token, validation.normalized);
      if (currentToken.current !== token) {
        return;
      }
      await acceptSession({ token, user: result.user });
      setScreen('perfil');
      Alert.alert('Sucesso', 'Perfil atualizado.');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }
  async function saveMood() {
    const validation = validateMoodEntry({
      tipo: moodType,
      intensidade: intensity,
      descricao: description,
    });
    if (!validation.valid) {
      Alert.alert('Validação', String(Object.values(validation.errors)[0]));
      return;
    }
    if (!session) {
      return;
    }
    const token = session.token;
    const clientId = editingMoodId || createClientId();
    setLoading(true);
    try {
      if (editingMoodId) {
        const wasPending = await updatePendingMood(session.user.id, editingMoodId, validation.normalized);
        if (!wasPending) await api.updateMood(token, editingMoodId, validation.normalized);
      } else {
        try {
          await api.saveMood(token, { ...validation.normalized, clientId });
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 0)) throw error;
          await queueRecord(session.user.id, {
            kind: 'mood', id: clientId, createdAt: new Date().toISOString(),
            value: { ...validation.normalized },
          });
          Alert.alert('Salvo neste aparelho', 'O registro será enviado quando a conexão retornar.');
        }
      }
      if (currentToken.current !== token) {
        return;
      }
      setDescription('');
      setMoodType('feliz');
      setIntensity(4);
      setEditingMoodId(null);
      setScreen('historico');
      Alert.alert('Sucesso', editingMoodId ? 'Registro atualizado.' : 'Registro salvo.');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }

  async function saveDiaryEntry() {
    const title = diaryTitle.trim();
    const validation = validateDiaryEntry({
      prompt: title,
      usePrompt: title.length > 0,
      resposta: diaryText,
    });
    if (!validation.valid) {
      Alert.alert('Validação', String(Object.values(validation.errors)[0]));
      return;
    }
    if (!session) {
      return;
    }
    setLoading(true);
    const token = session.token;
    const clientId = createClientId();
    try {
      let result: { registro: DiaryEntry };
      try {
        result = await api.diarySave(token, { ...validation.normalized, clientId });
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 0)) throw error;
        const createdAt = new Date().toISOString();
        await queueRecord(session.user.id, {
          kind: 'diary', id: clientId, createdAt,
          value: { prompt: validation.normalized.usePrompt ? validation.normalized.prompt : null, resposta: validation.normalized.resposta },
        });
        result = { registro: { id: clientId, criado_em: createdAt, prompt: validation.normalized.usePrompt ? validation.normalized.prompt : null, resposta: validation.normalized.resposta } };
        Alert.alert('Salvo neste aparelho', 'A entrada será enviada quando a conexão retornar.');
      }
      if (currentToken.current !== token) {
        return;
      }
      const nextEntry = result.registro;
      setDiaryEntries(current => [nextEntry, ...current]);
      setDiaryText('');
      setDiaryTitle('');
      setDiaryMood('bem');
      setScreen('diario');
      setSelectedDiaryEntry(nextEntry);
      Alert.alert('Sucesso', 'Registro do diário salvo.');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }

  async function changeDiaryEntry(remove: boolean) {
    if (!session || !selectedDiaryEntry || loading) {
      return;
    }
    const validation = validateDiaryEntry({
      prompt: diaryTitle,
      resposta: diaryText,
    });
    if (!remove && !validation.valid) {
      Alert.alert('Validação', String(Object.values(validation.errors)[0]));
      return;
    }
    const token = session.token;
    const id = selectedDiaryEntry.id;
    setLoading(true);
    try {
      if (remove) {
        await api.diaryDelete(token, id);
        if (currentToken.current !== token) {
          return;
        }
        setDiaryEntries(current => current.filter(item => item.id !== id));
        setSelectedDiaryEntry(null);
        setScreen('diario');
      } else {
        const result = await api.diaryUpdate(token, id, validation.normalized);
        if (currentToken.current !== token) {
          return;
        }
        setDiaryEntries(current =>
          current.map(item => item.id === id ? result.registro : item),
        );
        setSelectedDiaryEntry(result.registro);
        setScreen('diarioDetalhes');
      }
      resetDiaryDraft();
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }

  function resetDiaryDraft() {
    setDiaryTitle('');
    setDiaryText('');
    setDiaryMood('bem');
  }
  const isDarkMode = themeMode === 'dark';
  const theme = isDarkMode
    ? {
        background: '#111A18',
        surface: '#1C2925',
        surfaceAlt: '#233830',
        text: '#F1F5F2',
        textMuted: '#B5C4BD',
        border: '#34473F',
        accent: '#75C7A8',
        accentSoft: '#25443A',
        danger: '#F0A6A0',
        dangerSoft: '#382825',
        tabBackground: '#17221F',
        tabInactive: '#9AADA4',
      }
    : {
        background: '#F5F7F4',
        surface: '#ffffff',
        surfaceAlt: '#EDF4F0',
        text: '#24332F',
        textMuted: '#65746F',
        border: '#E0E8E2',
        accent: '#2F7563',
        accentSoft: '#E2F0E9',
        danger: '#B65A51',
        dangerSoft: '#F8ECEA',
        tabBackground: '#ffffff',
        tabInactive: '#788780',
      };
  const button = (label: string, onPress: () => void, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      accessibilityState={{ disabled: loading }}
      style={({ pressed }) => [
        secondary ? styles.secondaryButton : styles.button,
        secondary
          ? {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
            }
          : { backgroundColor: theme.accent, borderColor: theme.accent },
        loading && styles.buttonDisabled,
        pressed && !loading && styles.buttonPressed,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          secondary ? styles.secondaryButtonText : styles.buttonText,
          secondary && { color: theme.accent },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  if (booting || bootError) {
    return (
      <SafeAreaView
        style={[styles.screenBox, { backgroundColor: theme.background }]}
      >
        {booting ? (
          <ActivityIndicator accessibilityLabel="Carregando sessão" />
        ) : (
          <>
            <Text style={[styles.title, { color: theme.text }]}>
              Não foi possível conectar
            </Text>
            <Text style={{ color: theme.textMuted }}>{bootError}</Text>
            {button('Tentar novamente', restoreSession)}
          </>
        )}
      </SafeAreaView>
    );
  }
  if (!session) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.loginContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <View
            style={[
              styles.loginCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View
              style={[
                styles.loginBrandWrap,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
              ]}
            >
              <Text style={[styles.loginBrand, { color: theme.accent }]}>
                MenteClara
              </Text>
            </View>
            <Text style={[styles.loginTitle, { color: theme.text }]}>
              {screen === 'cadastro' ? 'Criar conta' : 'Bem-vindo de volta'}
            </Text>
            <Text style={[styles.loginSubtitle, { color: theme.textMuted }]}>
              Acompanhe seu bem-estar e cuide da sua mente todos os dias.
            </Text>
            {screen === 'cadastro' ? (
              <>
                <Text style={[styles.label, { color: theme.text }]}>Nome</Text>
                <TextInput
                  accessibilityLabel="Nome"
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  editable={!loading}
                  placeholder="Seu nome"
                  placeholderTextColor={theme.textMuted}
                />
              </>
            ) : null}
            <Text style={[styles.label, { color: theme.text }]}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              value={email}
              onChangeText={setEmail}
              maxLength={254}
              editable={!loading}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="seu@email.com"
              placeholderTextColor={theme.textMuted}
            />
            <Text style={[styles.label, { color: theme.text }]}>Senha</Text>
            <TextInput
              accessibilityLabel="Senha"
              style={[
                styles.input,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              secureTextEntry
              placeholder="Sua senha"
              placeholderTextColor={theme.textMuted}
            />
            {screen === 'cadastro' ? (
              <Text style={[styles.cardText, { color: theme.textMuted }]}>
                Use ao menos 8 caracteres, com maiúscula, minúscula, número e
                símbolo.
              </Text>
            ) : null}
            {button(
              loading
                ? 'Aguarde...'
                : screen === 'cadastro'
                ? 'Criar conta'
                : 'Entrar',
              authenticate,
            )}
            {button(
              screen === 'cadastro' ? 'Voltar ao login' : 'Criar usuário',
              () => {
                setName('');
                setEmail('');
                setPassword('');
                setScreen(screen === 'cadastro' ? 'login' : 'cadastro');
              },
              true,
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
  const showTabs = ![
    'editarPerfil',
    'diarioNova',
    'diarioEditar',
    'diarioExcluir',
    'diarioDetalhes',
  ].includes(screen);

  const quickMoodOptions = [
    { key: 'triste', label: 'Triste', emoji: '😞' },
    { key: 'ansioso', label: 'Ansioso', emoji: '😟' },
    { key: 'calmo', label: 'Calmo', emoji: '😐' },
    { key: 'feliz', label: 'Feliz', emoji: '🙂' },
    { key: 'motivado', label: 'Motivado', emoji: '😄' },
  ] as const;

  const moodMeta: Record<string, { label: string; emoji: string }> = {
    triste: { label: 'Muito mal', emoji: '😞' },
    ansioso: { label: 'Mal', emoji: '😕' },
    calmo: { label: 'Normal', emoji: '😐' },
    feliz: { label: 'Bem', emoji: '🙂' },
    motivado: { label: 'Muito bem', emoji: '😄' },
  };

  const selectedMoodMeta = moodMeta[moodType] ?? moodMeta.feliz;

  const recommendation = (() => {
    if (moodType === 'triste' || moodType === 'ansioso') {
      return {
        title: 'Respiração guiada',
        subtitle: '3 minutos para desacelerar',
        screen: 'respiracao' as const,
      };
    }

    if (moodType === 'calmo') {
      return {
        title: 'Diário',
        subtitle: 'Registre um momento leve do seu dia',
        screen: 'diario' as const,
      };
    }

    return {
      title: 'Diário',
      subtitle: 'Registre algo positivo do seu dia',
      screen: 'diario' as const,
    };
  })();

  const progressRecords = diaryEntries.length;

  const tabs = (
    <View
      style={[
        styles.tabBar,
        { backgroundColor: theme.tabBackground, borderTopColor: theme.border },
      ]}
    >
      {(
        [
          { key: 'home', icon: '⌂', label: 'Início' },
          { key: 'humor', icon: '＋', label: 'Registrar' },
          { key: 'historico', icon: '▥', label: 'Histórico' },
          { key: 'bemestar', icon: '✿', label: 'Bem-estar' },
          { key: 'perfil', icon: '♙', label: 'Perfil' },
        ] as const
      ).map(({ key, icon, label }) => {
        const selected = screen === key || (key === 'bemestar' && screen === 'respiracao') ||
          (key === 'home' && screen.startsWith('diario'));
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            key={key}
            disabled={loading}
            onPress={() => setScreen(key)}
            style={({ pressed }) => [
              selected ? styles.tabItemActive : styles.tabItem,
              selected && { backgroundColor: theme.accentSoft },
              pressed && styles.tabItemPressed,
            ]}
          >
            <Text
              style={[
                selected ? styles.tabTextActive : styles.tabText,
                { color: selected ? theme.accent : theme.tabInactive },
              ]}
            >
              {icon}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                selected ? styles.tabLabelActive : styles.tabLabel,
                { color: selected ? theme.accent : theme.tabInactive },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (screen === 'amizades') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <FriendsScreen
          token={session.token}
          darkMode={isDarkMode}
          onBack={() => setScreen('perfil')}
        />
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'autoavaliacao') {
    return (
      <AssessmentScreen
        key={session.user.id}
        darkMode={isDarkMode}
        onBack={() => setScreen('home')}
        onHelp={() => setScreen('emergencia')}
      />
    );
  }
  if (screen === 'historico') {
    return (
      <HistoryScreen
        token={session.token}
        userId={session.user.id}
        onBack={() => setScreen('home')}
        darkMode={isDarkMode}
        onEdit={entry => {
          setEditingMoodId(entry.id);
          setMoodType(entry.tipo);
          setIntensity(entry.intensidade);
          setDescription(entry.descricao || '');
          setScreen('humor');
        }}
      />
    );
  }
  if (screen === 'bemestar') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <SprintTwoScreen
          userId={session.user.id}
        token={session.token}
          darkMode={isDarkMode}
          onThemeChange={() => {
            const nextTheme = isDarkMode ? 'light' : 'dark';
            setThemeMode(nextTheme);
            saveTheme(nextTheme).catch(() =>
              Alert.alert('Erro', 'Não foi possível salvar o tema.'),
            );
          }}
          onBreathing={() => setScreen('respiracao')}
        />
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'progresso') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <SprintThreeScreen
          userId={session.user.id}
          token={session.token}
          darkMode={isDarkMode}
          onSaveReflection={async text => {
            const prompt = 'Exercício de reflexão';
            const clientId = createClientId();
            try {
              await api.diarySave(session.token, { prompt, resposta: text, clientId });
            } catch (error) {
              if (!(error instanceof ApiError && error.status === 0)) throw error;
              await queueRecord(session.user.id, {
                kind: 'diary', id: clientId, createdAt: new Date().toISOString(),
                value: { prompt, resposta: text },
              });
            }
          }}
        />
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'profissionais') {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.profileContainer}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Profissionais</Text>
          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Diretório ainda não configurado</Text>
            <Text style={[styles.cardText, { color: theme.textMuted }]}>
              Este projeto não possui uma fonte verificada de profissionais, região de atendimento ou integração de agendamento. Para evitar apresentar contatos ou credenciais sem confirmação, a lista permanece vazia.
            </Text>
            <Text style={[styles.cardText, { color: theme.textMuted, marginTop: 12 }]}>
              Uma integração futura precisa definir uma fonte oficial, consentimento para compartilhar dados e como tratar disponibilidade e emergências.
            </Text>
          </View>
          {button('Voltar à ajuda', () => setScreen('emergencia'), true)}
        </ScrollView>
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'diarioExcluir' && selectedDiaryEntry) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <View
            style={[
              styles.diaryDetailHeaderCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.diaryDetailTitle, { color: theme.text }]}>
              {selectedDiaryEntry.prompt || 'Uma manhã mais leve'}
            </Text>
            <Text style={[styles.diaryDetailMeta, { color: theme.textMuted }]}>
              {new Date(selectedDiaryEntry.criado_em).toLocaleString('pt-BR')}
            </Text>
            <View style={styles.diaryDetailEmojiRow}>
              <Text style={styles.diaryDetailEmoji}>
                {diaryMoodOptions.find(item => item.key === diaryMood)?.emoji ||
                  '🙂'}
              </Text>
            </View>
            <Text style={[styles.diaryDetailText, { color: theme.text }]}>
              {selectedDiaryEntry.resposta}
            </Text>
          </View>

          <View
            style={[
              styles.deleteCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.deleteIconWrap}>
              <Text style={styles.deleteIcon}>🗑️</Text>
            </View>
            <Text style={[styles.deleteTitle, { color: theme.text }]}>
              Excluir esta entrada?
            </Text>
            <Text style={[styles.deleteText, { color: theme.textMuted }]}>
              Esta ação não pode ser desfeita. Sua entrada será apagada
              permanentemente.
            </Text>
            <Pressable
              style={styles.deleteButton}
              disabled={loading}
              onPress={() => changeDiaryEntry(true)}
            >
              <Text style={styles.deleteButtonText}>
                {loading ? 'Excluindo...' : 'Excluir entrada'}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.cancelButton,
                { backgroundColor: theme.accentSoft },
              ]}
              disabled={loading}
              onPress={() => setScreen('diarioDetalhes')}
            >
              <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                Cancelar
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.backButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => setScreen('diario')}
            >
              <Text style={[styles.backButtonText, { color: theme.text }]}>
                Voltar
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'diarioEditar' && selectedDiaryEntry) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            Editar entrada
          </Text>
          <Text style={[styles.editSubtitle, { color: theme.textMuted }]}>
            Ajuste o que precisar, no seu tempo.
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>
            Título (opcional)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={diaryTitle}
            onChangeText={setDiaryTitle}
            placeholder="Dê um nome a este momento"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>Sua entrada</Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            multiline
            value={diaryText}
            onChangeText={setDiaryText}
            placeholder="Escreva aqui..."
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>
            Como você está sentindo?
          </Text>
          <View style={styles.moodRow}>
            {diaryMoodOptions.map(option => (
              <Pressable
                key={option.key}
                style={[
                  styles.moodOption,
                  {
                    backgroundColor: isDarkMode ? '#1e293b' : '#f3f3f3',
                    borderColor:
                      diaryMood === option.key
                        ? '#3c9a73'
                        : isDarkMode
                        ? '#334155'
                        : 'transparent',
                  },
                  diaryMood === option.key && styles.moodOptionSelected,
                ]}
                onPress={() => setDiaryMood(option.key)}
              >
                <Text style={styles.moodOptionText}>{option.emoji}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.primaryButton}
            disabled={loading}
            onPress={() => changeDiaryEntry(false)}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? 'Salvando...' : 'Salvar alterações'}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.backButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => setScreen('diarioDetalhes')}
          >
            <Text style={[styles.backButtonText, { color: theme.text }]}>
              Voltar
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'diarioDetalhes' && selectedDiaryEntry) {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>
            {selectedDiaryEntry.prompt || 'Uma manhã mais leve'}
          </Text>
          <Text style={[styles.diaryDetailMeta, { color: theme.textMuted }]}>
            {new Date(selectedDiaryEntry.criado_em).toLocaleString('pt-BR')}
          </Text>

          <View
            style={[
              styles.diaryDetailCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.diaryDetailEmojiRow}>
              <Text style={styles.diaryDetailEmoji}>
                {diaryMoodOptions.find(item => item.key === diaryMood)?.emoji ||
                  '🙂'}
              </Text>
            </View>
            <Text style={[styles.diaryDetailText, { color: theme.text }]}>
              {selectedDiaryEntry.resposta}
            </Text>
          </View>

          <View style={styles.diaryDetailActions}>
            <Pressable
              style={[
                styles.secondaryActionButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => {
                setDiaryTitle(selectedDiaryEntry.prompt || '');
                setDiaryText(selectedDiaryEntry.resposta);
                setScreen('diarioEditar');
              }}
            >
              <Text
                style={[
                  styles.secondaryActionButtonText,
                  { color: theme.text },
                ]}
              >
                Editar
              </Text>
            </Pressable>
            <Pressable
              style={styles.deleteActionButton}
              onPress={() => setScreen('diarioExcluir')}
            >
              <Text style={styles.deleteActionButtonText}>Excluir</Text>
            </Pressable>
          </View>

          <Pressable
            style={[
              styles.backButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => setScreen('diario')}
          >
            <Text style={[styles.backButtonText, { color: theme.text }]}>
              Voltar
            </Text>
          </Pressable>

          <Text style={[styles.privacyNote, { color: theme.textMuted }]}>
            Esta entrada é privada e visível apenas para você.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'diarioNova') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Pressable
            accessibilityLabel="Voltar ao diário"
            style={styles.topBackButton}
            onPress={() => {
              resetDiaryDraft();
              setScreen('diario');
            }}
          >
            <Text style={[styles.topBackButtonText, { color: theme.accent }]}>
              ← Voltar ao diário
            </Text>
          </Pressable>

          <Text style={[styles.title, { color: theme.text }]}>
            Nova entrada
          </Text>
          <Text style={[styles.subtitleText, { color: theme.textMuted }]}>
            Escreva sem pressa. Este espaço é só seu.
          </Text>

          <Text style={[styles.label, { color: theme.text }]}>
            Título (opcional)
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            value={diaryTitle}
            onChangeText={setDiaryTitle}
            placeholder="Dê um nome a este momento"
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>
            O que você quer guardar de hoje?
          </Text>
          <TextInput
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            multiline
            maxLength={5000}
            value={diaryText}
            onChangeText={setDiaryText}
            placeholder="Escreva aqui..."
            placeholderTextColor={theme.textMuted}
          />

          <Text style={[styles.label, { color: theme.text }]}>
            Como você está sentindo?
          </Text>
          <View style={styles.moodRow}>
            {diaryMoodOptions.map(option => (
              <Pressable
                key={option.key}
                style={[
                  styles.moodOption,
                  {
                    backgroundColor: isDarkMode ? '#1e293b' : '#f3f3f3',
                    borderColor:
                      diaryMood === option.key
                        ? '#3c9a73'
                        : isDarkMode
                        ? '#334155'
                        : 'transparent',
                  },
                  diaryMood === option.key && styles.moodOptionSelected,
                ]}
                onPress={() => setDiaryMood(option.key)}
              >
                <Text style={styles.moodOptionText}>{option.emoji}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              saveDiaryEntry();
            }}
          >
            <Text style={styles.primaryButtonText}>Salvar entrada</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Cancelar e voltar ao diário"
            style={[
              styles.backButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
            onPress={() => {
              resetDiaryDraft();
              setScreen('diario');
            }}
          >
            <Text style={[styles.backButtonText, { color: theme.text }]}>
              Cancelar / Voltar
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (screen === 'diario') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Meu diário</Text>
          <Text style={[styles.subtitleText, { color: theme.textMuted }]}>
            Um espaço só seu para guardar o que sente.
          </Text>

          <View
            style={[
              styles.diaryPrivateBox,
              {
                backgroundColor: isDarkMode ? '#132a24' : '#edf5f1',
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={styles.lockText}>🔒</Text>
            <Text style={[styles.diaryPrivateText, { color: theme.text }]}>
              Suas entradas são privadas.
            </Text>
          </View>

          <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
            Entradas recentes
          </Text>

          {diaryLoading ? (
            <ActivityIndicator accessibilityLabel="Carregando diário" />
          ) : diaryEntries.length === 0 ? (
            <Text style={[styles.cardText, { color: theme.textMuted }]}>
              Ainda não há registros neste diário.
            </Text>
          ) : (
            diaryEntries.map(entry => (
              <Pressable
                key={entry.id}
                style={[
                  styles.diaryHistoryCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() => {
                  setSelectedDiaryEntry(entry);
                  setScreen('diarioDetalhes');
                }}
              >
                <Text
                  style={[
                    styles.diaryHistoryDateLabel,
                    { color: theme.textMuted },
                  ]}
                >
                  {new Date(entry.criado_em)
                    .toLocaleString('pt-BR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                    .replace(/(^\w)/, c => c.toUpperCase())}
                </Text>
                <View style={styles.diaryHistoryRow}>
                  <Text style={styles.diaryHistoryEmoji}>
                    {diaryMoodOptions[2].emoji}
                  </Text>
                  <View style={styles.diaryHistoryContent}>
                    <Text
                      style={[styles.diaryHistoryTitle, { color: theme.text }]}
                    >
                      {entry.prompt || 'Uma manhã mais leve'}
                    </Text>
                    <Text
                      style={[
                        styles.diaryHistoryPreview,
                        { color: theme.textMuted },
                      ]}
                      numberOfLines={2}
                    >
                      {entry.resposta}
                    </Text>
                  </View>
                  <Text style={[styles.diaryArrow, { color: theme.textMuted }]}>
                    ›
                  </Text>
                </View>
              </Pressable>
            ))
          )}

          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              resetDiaryDraft();
              setScreen('diarioNova');
            }}
          >
            <Text style={styles.primaryButtonText}>+ Nova entrada</Text>
          </Pressable>
        </ScrollView>
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'emergencia') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Emergência</Text>

          <View
            style={[
              styles.emergencyCard,
              {
                backgroundColor: isDarkMode ? '#3b1f1e' : '#fff1f0',
                borderColor: isDarkMode ? '#7f1d1d' : '#f5b5b0',
              },
            ]}
          >
            <Text
              style={[
                styles.emergencyBadge,
                { color: isDarkMode ? '#fca5a5' : '#b3261e' },
              ]}
            >
              CVV
            </Text>
            <Text
              style={[
                styles.emergencyPhone,
                { color: isDarkMode ? '#fecaca' : '#7f1d1d' },
              ]}
            >
              188
            </Text>
            <Text style={[styles.emergencyText, { color: theme.textMuted }]}>
              Ligue imediatamente em caso de risco, crise ou se precisar de
              apoio emocional urgente.
            </Text>
          </View>

          {button('Ligar para CVV', () => Linking.openURL('tel:188'))}
          <Text style={[styles.emergencyText, { color: theme.textMuted, marginBottom: 8 }]}>
            Se preferir conversar com uma IA, você pode abrir o ChatGPT. Ele não substitui atendimento profissional nem serviços de emergência.
          </Text>
          {button(
            'Conversar com IA',
            () => {
              Linking.openURL('https://chatgpt.com/').catch(() =>
                Alert.alert('Não foi possível abrir', 'Tente acessar https://chatgpt.com/ pelo navegador.'),
              );
            },
            true,
          )}
          {button('Consultar profissionais', () => setScreen('profissionais'), true)}
          {button(
            'Falar com apoio',
            () =>
              Alert.alert(
                'Suporte',
                'Entre em contato com alguém próximo ou ligue para 188.',
              ),
            true,
          )}
        </ScrollView>
        {tabs}
      </SafeAreaView>
    );
  }
  if (screen === 'chatIa') {
    return (
      <SafeAreaView
        style={[styles.safeArea, { backgroundColor: theme.background }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.profileContainer,
            { backgroundColor: theme.background },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>Sugestões de apoio</Text>

          <View
            style={[
              styles.aiBubble,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.aiText, { color: theme.text }]}>
              Estas sugestões são orientações fixas do aplicativo. Não há uma IA ou atendimento humano neste recurso, e as sugestões não substituem ajuda profissional.
            </Text>
          </View>

          <View style={styles.quickActions}>
            <Pressable
              style={[
                styles.quickAction,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() =>
                Alert.alert(
                  'IA',
                  'Tente inspirar por 4 segundos e expirar por 6, repetindo por 5 ciclos.',
                )
              }
            >
              <Text style={[styles.quickActionText, { color: theme.text }]}>
                Respirar
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.quickAction,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() =>
                Alert.alert(
                  'IA',
                  'Você não está sozinho(a). Posso te ajudar a organizar uma rotina mais tranquila.',
                )
              }
            >
              <Text style={[styles.quickActionText, { color: theme.text }]}>
                Apoio
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.quickAction,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => setScreen('emergencia')}
            >
              <Text style={[styles.quickActionText, { color: theme.text }]}>
                Emergência
              </Text>
            </Pressable>
          </View>
        </ScrollView>
        {tabs}
      </SafeAreaView>
    );
  }
  let content;
  switch (screen) {
    case 'perfil':
      content = (
        <>
          <Text style={[styles.title, { color: theme.text }]}>Perfil</Text>
          {profileLoading ? (
            <ActivityIndicator accessibilityLabel="Atualizando perfil" />
          ) : null}
          {profileError ? (
            <>
              <Text accessibilityRole="alert" style={{ color: theme.danger }}>
                {profileError}
              </Text>
              {button(
                'Tentar novamente',
                () => setProfileReload(value => value + 1),
                true,
              )}
            </>
          ) : null}
          <Text style={[styles.text, { color: theme.text }]}>
            Nome: {session.user.nome}
          </Text>
          <Text style={[styles.text, { color: theme.text }]}>
            Email: {session.user.email}
          </Text>
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <Text style={[styles.label, { color: theme.text }]}>Tema</Text>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.button,
                {
                  backgroundColor: theme.accent,
                  marginTop: 0,
                },
              ]}
              onPress={() => {
                const nextTheme = isDarkMode ? 'light' : 'dark';
                setThemeMode(nextTheme);
                saveTheme(nextTheme).catch(() =>
                  Alert.alert('Erro', 'Não foi possível salvar o tema.'),
                );
              }}
            >
              <Text style={styles.buttonText}>
                {isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              </Text>
            </Pressable>
          </View>
          {button('Amizades  ·  QR e lista', () => setScreen('amizades'), true)}
          {button('Editar perfil', () => {
            setProfileForm({
              name: session.user.nome,
              email: session.user.email,
            });
            setScreen('editarPerfil');
          })}
          {button(loading ? 'Saindo...' : 'Sair da conta', logout, true)}
        </>
      );
      break;
    case 'editarPerfil':
      content = (
        <>
          <Text style={[styles.title, { color: theme.text }]}>
            Editar perfil
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>Nome</Text>
          <TextInput
            accessibilityLabel="Nome do perfil"
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholderTextColor={theme.textMuted}
            value={profileForm.name}
            maxLength={120}
            editable={!loading}
            onChangeText={value =>
              setProfileForm(current => ({ ...current, name: value }))
            }
          />
          <Text style={[styles.label, { color: theme.text }]}>Email</Text>
          <TextInput
            accessibilityLabel="Email do perfil"
            style={[
              styles.input,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            placeholderTextColor={theme.textMuted}
            value={profileForm.email}
            maxLength={254}
            editable={!loading}
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={value =>
              setProfileForm(current => ({ ...current, email: value }))
            }
          />
          {button(loading ? 'Salvando...' : 'Salvar alterações', saveProfile)}
          {button('Cancelar', () => setScreen('perfil'), true)}
        </>
      );
      break;
    case 'humor':
      content = (
        <>
          <Text style={[styles.title, { color: theme.text }]}> 
            {editingMoodId ? 'Editar check-in' : 'Seu check-in emocional'}
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            Escolha a emoção mais próxima de agora
          </Text>
          <View style={styles.optionGrid}>
            {moodChoices.map(option => {
              const selected = moodType === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  disabled={loading}
                  onPress={() => setMoodType(option.key)}
                  style={({ pressed }) => [
                    styles.optionButton,
                    {
                      backgroundColor: isDarkMode ? option.dark : option.light,
                      borderColor: isDarkMode ? option.dark + '88' : option.light,
                    },
                    selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                    pressed && styles.tilePressed,
                  ]}
                >
                  <Text style={styles.optionEmoji}>{option.emoji}</Text>
                  <Text style={[styles.optionText, { color: selected ? theme.accent : isDarkMode ? option.darkTone : option.tone }]}>
                    {option.label}
                  </Text>
                  {selected ? <Text style={[styles.optionCheck, { color: theme.accent }]}>✓</Text> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.label, { color: theme.text }]}>Intensidade</Text>
          <View style={styles.sliderWrapper}>
            {[1, 2, 3, 4, 5].map(level => (
              <Pressable
                key={level}
                accessibilityRole="button"
                accessibilityLabel={'Intensidade ' + level}
                accessibilityState={{ selected: intensity === level }}
                disabled={loading}
                onPress={() => setIntensity(level)}
                style={[
                  styles.sliderButton,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                  intensity === level && styles.sliderButtonSelected,
                  intensity === level && {
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.sliderText,
                    { color: theme.text },
                    intensity === level && styles.sliderTextSelected,
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.moodIntensityText, { color: theme.textMuted }]}>
            {intensityLabels[intensity - 1]}
          </Text>
          <Text style={[styles.label, { color: theme.text }]}>
            Descrição opcional
          </Text>
          <TextInput
            accessibilityLabel="Descrição do humor"
            style={[
              styles.textArea,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              },
            ]}
            multiline
            maxLength={280}
            editable={!loading}
            value={description}
            onChangeText={setDescription}
            placeholder="Conte o que aconteceu hoje..."
            placeholderTextColor={theme.textMuted}
          />
          {button(loading ? 'Salvando...' : editingMoodId ? 'Salvar alterações' : 'Salvar registro', saveMood)}
          {button('Cancelar', () => setScreen('home'), true)}
        </>
      );
      break;
    case 'respiracao': {
      const activePhase = breathingPhases[breathingPhaseIndex];
      const handlePauseBreathing = () => {
        setIsBreathingPaused(current => !current);
      };
      const handleFinishBreathing = () => {
        breathingScale.setValue(1);
        setBreathingPhaseIndex(0);
        setBreathingTimeLeft(breathingPhases[0].duration);
        setIsBreathingPaused(false);
        setScreen('home');
      };
      content = (
        <>
          <View style={styles.breathingWrap}>
            <Text style={[styles.breathingTitle, { color: theme.text }]}>
              Pausa para respirar
            </Text>
            <Text
              style={[styles.breathingSubtitle, { color: theme.textMuted }]}
            >
              Um minuto para voltar ao presente.
            </Text>

            <View
              style={[
                styles.breathingCircleOuter,
                {
                  backgroundColor: theme.accentSoft,
                  borderColor: theme.accent,
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.breathingCircleInner,
                  {
                    backgroundColor: theme.accent,
                    borderColor: theme.accent,
                    transform: [{ scale: breathingScale }],
                  },
                ]}
              >
                <Text style={styles.breathingText}>{activePhase.label}</Text>
                <Text style={styles.breathingTextSecondary}>
                  {activePhase.hint}
                </Text>
              </Animated.View>
            </View>

            <Text style={[styles.breathingStep, { color: theme.accent }]}>
              Etapa {breathingPhaseIndex + 1} de {breathingPhases.length} ·{' '}
              {formatBreathingTimer(breathingTimeLeft)}
            </Text>

            <View
              style={[
                styles.breathingTimerRow,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <Text
                style={[styles.breathingTimerLabel, { color: theme.textMuted }]}
              >
                Cronômetro
              </Text>
              <Text
                style={[styles.breathingTimerValue, { color: theme.accent }]}
              >
                {formatBreathingTimer(breathingTimeLeft)}
              </Text>
            </View>

            <View style={styles.breathingActions}>
              <Pressable
                style={[
                  styles.breathingAction,
                  styles.breathingActionSecondary,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={handlePauseBreathing}
              >
                <Text
                  style={[
                    styles.breathingActionSecondaryText,
                    { color: theme.text },
                  ]}
                >
                  {isBreathingPaused ? 'Continuar' : 'Pausar'}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.breathingAction,
                  styles.breathingActionPrimary,
                  { backgroundColor: theme.accent, borderColor: theme.accent },
                ]}
                onPress={handleFinishBreathing}
              >
                <Text style={styles.breathingActionPrimaryText}>Encerrar</Text>
              </Pressable>
            </View>
          </View>
        </>
      );
      break;
    }
    default:
      content = (
        <>
          <View style={styles.homeHeader}>
            <View>
              <Text style={[styles.homeBrand, { color: theme.text }]}>
                Mente Clara
              </Text>
              <Text style={[styles.homeBrandSubtitle, { color: theme.textMuted }]}>Seu espaço de bem-estar</Text>
            </View>
          </View>

          <Text style={[styles.homeGreeting, { color: theme.text }]}>
            Olá, {session.user.nome} 👋
          </Text>
          <Text style={[styles.homeSubGreeting, { color: theme.textMuted }]}>
            Um espaço tranquilo para cuidar de você, no seu ritmo.
          </Text>

          <View
            style={[
              styles.homeMoodCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Como você está hoje?
            </Text>
            <View style={styles.moodQuickGrid}>
              {quickMoodOptions.map(option => {
                const tone = moodChoices.find(item => item.key === option.key)!;
                const selected = moodType === option.key;
                return (
                  <Pressable
                    key={option.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={async () => {
                    setMoodType(option.key);
                    const validation = validateMoodEntry({
                      tipo: option.key,
                      intensidade: 4,
                      descricao: '',
                    });

                    if (!validation.valid) {
                      Alert.alert(
                        'Validação',
                        String(Object.values(validation.errors)[0]),
                      );
                      return;
                    }

                    if (!session?.token) {
                      return;
                    }

                    const clientId = createClientId();
                    try {
                      await api.saveMood(session.token, { ...validation.normalized, clientId });
                    } catch (error) {
                      if (error instanceof ApiError && error.status === 0) {
                        try {
                          await queueRecord(session.user.id, {
                            kind: 'mood', id: clientId, createdAt: new Date().toISOString(),
                            value: { ...validation.normalized },
                          });
                          Alert.alert('Salvo neste aparelho', 'O registro será enviado quando a conexão retornar.');
                        } catch (queueError) {
                          Alert.alert('Erro', message(queueError));
                        }
                      } else {
                        Alert.alert('Erro', message(error));
                      }
                    }
                    }}
                    style={({ pressed }) => [
                      styles.moodQuickButton,
                      { backgroundColor: isDarkMode ? tone.dark : tone.light, borderColor: isDarkMode ? tone.dark + '88' : tone.light },
                      selected && { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                      pressed && styles.tilePressed,
                    ]}
                  >
                    <Text style={styles.moodQuickEmoji}>{option.emoji}</Text>
                    <Text style={[styles.moodQuickText, { color: selected ? theme.accent : isDarkMode ? tone.darkTone : tone.tone }]}>
                      {option.label}
                    </Text>
                    {selected ? <Text style={[styles.moodQuickCheck, { color: theme.accent }]}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.homeMoodSummaryRow}>
              <Text style={[styles.homeMoodSummaryText, { color: theme.text }]}>
                Hoje você está se sentindo {selectedMoodMeta.emoji}{' '}
                {selectedMoodMeta.label}
              </Text>
              <Pressable onPress={() => setScreen('humor')}>
                <Text style={[styles.homeMoodLink, { color: theme.accent }]}>
                  Alterar
                </Text>
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.featureCardPrimary,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.featureCardLabel, { color: theme.accent }]}>
              🌿 Momento para você
            </Text>
            <Text style={[styles.featureCardTitle, { color: theme.text }]}>
              {recommendation.title}
            </Text>
            <Text
              style={[styles.featureCardSubtitle, { color: theme.textMuted }]}
            >
              {recommendation.subtitle}
            </Text>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              onPress={() => setScreen(recommendation.screen)}
            >
              <Text style={styles.primaryButtonText}>Começar</Text>
            </Pressable>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Seu progresso
            </Text>
            <View style={styles.progressRow}>
              <View
                style={[
                  styles.progressCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={styles.progressEmoji}>😊</Text>
                <Text
                  style={[styles.progressLabel, { color: theme.textMuted }]}
                >
                  Humor
                </Text>
                <Text style={[styles.progressValue, { color: theme.text }]}>
                  {selectedMoodMeta.label}
                </Text>
              </View>
              <View
                style={[
                  styles.progressCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <Text style={styles.progressEmoji}>🔥</Text>
                <Text
                  style={[styles.progressLabel, { color: theme.textMuted }]}
                >
                  Registros
                </Text>
                <Text style={[styles.progressValue, { color: theme.text }]}>
                  {progressRecords} dias
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Para você
            </Text>
            {button('Autoavaliação de bem-estar', () => setScreen('autoavaliacao'), true)}
            {button('Progresso, dados e reflexão', () => setScreen('progresso'), true)}
            <Pressable
              accessibilityRole="button"
              style={[
                styles.diaryShortcutCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => setScreen('diario')}
            >
              <View style={styles.diaryShortcutContent}>
                <Text style={styles.diaryShortcutIcon}>📖</Text>
                <View style={styles.diaryShortcutTextWrap}>
                  <Text
                    style={[styles.diaryShortcutTitle, { color: theme.text }]}
                  >
                    Diário
                  </Text>
                  <Text
                    style={[
                      styles.diaryShortcutSubtitle,
                      { color: theme.textMuted },
                    ]}
                  >
                    Escreva um pouco sobre seu dia
                  </Text>
                </View>
              </View>
              <Text
                style={[styles.diaryShortcutAction, { color: theme.accent }]}
              >
                Abrir diário →
              </Text>
            </Pressable>
          </View>
        </>
      );
  }
  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.profileContainer,
          { backgroundColor: theme.background },
        ]}
      >
        {screen !== 'login' && screen !== 'cadastro' ? (
          <View style={styles.emergencyHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir ajuda e emergência"
              style={({ pressed }) => [
                styles.emergencyFab,
                { backgroundColor: theme.dangerSoft, borderColor: theme.danger + '55' },
                pressed && styles.emergencyFabPressed,
              ]}
              onPress={() => setScreen('emergencia')}
            >
              <Text style={[styles.emergencyFabText, { color: theme.danger }]}>♡  Ajuda</Text>
            </Pressable>
          </View>
        ) : null}
        {content}
      </ScrollView>
      {showTabs ? tabs : null}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MainApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F4',
  },
  homeContainer: {
    flex: 1,
    backgroundColor: '#f3f5f7',
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    justifyContent: 'center',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroBadge: {
    backgroundColor: '#eaf8f2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfe7d5',
  },
  heroBadgeText: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 11,
  },
  greeting: {
    fontSize: 18,
    color: '#3e4d4d',
    marginBottom: 0,
    fontWeight: '600',
  },
  userName: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1f2d2d',
    marginBottom: 8,
  },
  heroText: {
    fontSize: 14,
    color: '#5d6668',
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 13,
    color: '#6d7d7f',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  cardAccent: {
    backgroundColor: '#edf9f4',
    borderColor: '#9ed7bf',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 6,
  },
  cardText: {
    fontSize: 14,
    color: '#5d6668',
  },
  emergencyHeader: {
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  emergencyFab: {
    backgroundColor: '#F8ECEA',
    borderRadius: 999,
    minHeight: 40,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E9C7C3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emergencyFabPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.97 }],
  },
  emergencyFabText: {
    color: '#A64D47',
    fontWeight: '700',
    fontSize: 13,
  },
  emergencyCard: {
    backgroundColor: '#fff1f0',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f5b5b0',
    padding: 20,
    marginBottom: 18,
  },
  emergencyBadge: {
    color: '#b3261e',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  emergencyPhone: {
    fontSize: 42,
    fontWeight: '800',
    color: '#7f1d1d',
    marginBottom: 8,
  },
  emergencyText: {
    color: '#5d6668',
    fontSize: 14,
    lineHeight: 20,
  },
  aiBubble: {
    backgroundColor: '#edf9f4',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#cfeee1',
    padding: 18,
    marginBottom: 18,
  },
  aiText: {
    color: '#1f2d2d',
    fontSize: 15,
    lineHeight: 22,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  quickAction: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dfe8eb',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginRight: 10,
    marginBottom: 10,
  },
  quickActionText: {
    color: '#1f2d2d',
    fontWeight: '700',
  },
  screenBox: {
    flex: 1,
    backgroundColor: '#f3f5f7',
    padding: 24,
    justifyContent: 'center',
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    backgroundColor: '#f3f5f7',
    padding: 24,
  },
  loginCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    padding: 26,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 5 },
  },
  loginBrandWrap: {
    alignSelf: 'flex-start',
    backgroundColor: '#eaf8f2',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfe7d5',
  },
  loginBrand: {
    color: '#1f8a68',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.8,
  },
  loginTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#1f2d2d',
    marginBottom: 8,
  },
  loginSubtitle: {
    color: '#5d6668',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  profileContainer: {
    flexGrow: 1,
    backgroundColor: '#F5F7F4',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 36,
  },
  moodContainer: {
    flexGrow: 1,
    backgroundColor: '#F5F7F4',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 36,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 8,
    marginTop: 6,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 9,
    marginBottom: 14,
  },
  optionButton: {
    width: '30.5%',
    minHeight: 76,
    backgroundColor: '#ffffff',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    paddingVertical: 9,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  optionButtonSelected: {
    backgroundColor: '#dff4ed',
    borderColor: '#2f8d72',
  },
  optionText: {
    color: '#2f3b3c',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  optionEmoji: {
    fontSize: 22,
  },
  optionCheck: {
    position: 'absolute',
    top: 6,
    right: 8,
    fontSize: 12,
    fontWeight: '900',
  },
  tilePressed: {
    opacity: 0.84,
    transform: [{ scale: 0.97 }],
  },
  optionTextSelected: {
    color: '#1f8a68',
  },
  sliderWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sliderButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dfe8eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderButtonSelected: {
    backgroundColor: '#2f8d72',
    borderColor: '#2f8d72',
  },
  sliderText: {
    color: '#2f3b3c',
    fontWeight: '700',
  },
  sliderTextSelected: {
    color: '#ffffff',
  },
  moodIntensityText: {
    color: '#5d6668',
    fontSize: 14,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#1f2d2d',
    marginBottom: 18,
  },
  textArea: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    minHeight: 100,
    textAlignVertical: 'top',
    padding: 14,
    color: '#1f2d2d',
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#2d7a67',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#2d7a67',
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    elevation: 2,
    shadowColor: '#17483d',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    minHeight: 50,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  secondaryButtonText: {
    color: '#2f8d72',
    fontSize: 15,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 0,
    paddingTop: 7,
    paddingBottom: 9,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    marginTop: 0,
    minHeight: 76,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 15,
    minHeight: 58,
    justifyContent: 'center',
  },
  tabItemActive: {
    flex: 1,
    backgroundColor: '#E2F0E9',
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 15,
    minHeight: 58,
    justifyContent: 'center',
  },
  tabItemPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.96 }],
  },
  tabText: {
    color: '#586b6f',
    fontWeight: '600',
    fontSize: 19,
  },
  tabTextActive: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 19,
  },
  tabLabel: {
    color: '#586b6f',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  tabLabelActive: {
    color: '#1f8a68',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 1,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  homeBrand: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2d2d',
    letterSpacing: 0.2,
  },
  homeBrandSubtitle: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  homeSosButton: {
    backgroundColor: '#fff1f0',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#f5b5b0',
  },
  homeSosText: {
    color: '#d93025',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  homeGreeting: {
    fontSize: 25,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 5,
  },
  homeSubGreeting: {
    fontSize: 15,
    color: '#5d6668',
    lineHeight: 22,
    marginBottom: 20,
  },
  homeMoodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    marginBottom: 18,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  moodQuickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 8,
    marginBottom: 14,
  },
  moodQuickButton: {
    flexGrow: 1,
    flexBasis: '17%',
    minWidth: 47,
    backgroundColor: '#f4f7f8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e7edf0',
    minHeight: 68,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  moodQuickButtonSelected: {
    backgroundColor: '#eaf8f2',
    borderColor: '#a7dfc8',
  },
  moodQuickEmoji: {
    fontSize: 21,
    marginBottom: 3,
  },
  moodQuickText: {
    fontSize: 10,
    color: '#4d5d5f',
    fontWeight: '700',
    textAlign: 'center',
  },
  moodQuickCheck: {
    position: 'absolute',
    top: 3,
    right: 6,
    fontSize: 10,
    fontWeight: '900',
  },
  moodQuickTextSelected: {
    color: '#1f8a68',
  },
  homeMoodSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
  },
  homeMoodSummaryText: {
    fontSize: 14,
    color: '#2d3c3d',
    fontWeight: '600',
    flexShrink: 1,
  },
  homeMoodLink: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 13,
  },
  featureCardPrimary: {
    backgroundColor: '#edf9f4',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: '#bfe7d5',
    marginBottom: 20,
  },
  featureCardLabel: {
    fontSize: 12,
    color: '#1f8a68',
    fontWeight: '800',
    marginBottom: 8,
  },
  featureCardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1f2d2d',
    marginBottom: 4,
  },
  featureCardSubtitle: {
    fontSize: 14,
    color: '#5d6668',
    marginBottom: 14,
  },
  sectionBlock: {
    marginBottom: 16,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 12,
  },
  progressCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    minHeight: 108,
    justifyContent: 'center',
  },
  progressEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: '#6d7d7f',
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  progressValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2d2d',
  },
  diaryShortcutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  diaryShortcutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  diaryShortcutIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  diaryShortcutTextWrap: {
    flex: 1,
  },
  diaryShortcutTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1f2d2d',
  },
  diaryShortcutSubtitle: {
    fontSize: 13,
    color: '#5d6668',
    marginTop: 4,
  },
  diaryShortcutAction: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1f2d2d',
  },
  text: {
    fontSize: 16,
    color: '#2f3b3c',
    marginBottom: 12,
  },
  breathingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: '100%',
  },
  breathingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2d2d',
    textAlign: 'center',
    marginBottom: 4,
  },
  breathingSubtitle: {
    fontSize: 14,
    color: '#5d6668',
    textAlign: 'center',
    marginBottom: 18,
  },
  breathingCircleOuter: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: '#dff3f3',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#67c7d2',
    marginBottom: 20,
  },
  breathingCircleInner: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#2f8d72',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#67c7d2',
  },
  breathingText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  breathingTextSecondary: {
    color: '#e6f7f4',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 6,
  },
  diaryToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  diaryToggle: {
    width: 52,
    height: 30,
    borderRadius: 999,
    backgroundColor: '#dfe8eb',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  diaryToggleActive: {
    backgroundColor: '#2f8d72',
  },
  diaryToggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#ffffff',
    transform: [{ translateX: 0 }],
  },
  diaryToggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  diaryPrivateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#edf5f1',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#dcece5',
  },
  lockText: {
    fontSize: 16,
    marginRight: 10,
  },
  diaryPrivateText: {
    color: '#2f3b3c',
    fontSize: 15,
    fontWeight: '600',
  },
  diaryHistoryDateLabel: {
    color: '#4c5d60',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  diaryHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  diaryHistoryEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  diaryHistoryContent: {
    flex: 1,
  },
  diaryArrow: {
    color: '#4f5f5d',
    fontSize: 28,
    marginLeft: 12,
  },
  diaryDetailCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    padding: 18,
    marginBottom: 18,
  },
  diaryDetailHeaderCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    padding: 18,
    marginBottom: 18,
  },
  diaryDetailMeta: {
    fontSize: 12,
    color: '#5d6668',
    marginBottom: 10,
  },
  diaryDetailEmojiRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  diaryDetailEmoji: {
    fontSize: 28,
  },
  diaryDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 6,
  },
  diaryDetailText: {
    color: '#2f3b3c',
    fontSize: 16,
    lineHeight: 24,
  },
  diaryDetailActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 18,
  },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#f1f3f2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dfe8eb',
  },
  secondaryActionButtonText: {
    color: '#2f3b3c',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteActionButton: {
    flex: 1,
    backgroundColor: '#d85d4d',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteActionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  privacyNote: {
    color: '#5d6668',
    fontSize: 12,
    textAlign: 'center',
  },
  deleteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e3e7ea',
    padding: 18,
  },
  deleteIconWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteIcon: {
    fontSize: 34,
  },
  deleteTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2d2d',
    marginBottom: 10,
  },
  deleteText: {
    color: '#4d5d5f',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  deleteButton: {
    backgroundColor: '#d85d4d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#edf3f2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#2f3b3c',
    fontSize: 18,
    fontWeight: '700',
  },
  editSubtitle: {
    fontSize: 15,
    color: '#4d5d5f',
    marginBottom: 18,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  moodOption: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#f3f3f3',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  moodOptionSelected: {
    backgroundColor: '#edf8f2',
    borderColor: '#3c9a73',
  },
  moodOptionText: {
    fontSize: 28,
  },
  subtitleText: {
    color: '#4d5d5f',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 16,
  },
  topBackButton: {
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  topBackButtonText: {
    fontWeight: '600',
    fontSize: 16,
  },
  backButton: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dfe8eb',
    marginTop: 12,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2d2d',
  },
  diaryPromptBox: {
    backgroundColor: '#edf9f4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cfeee1',
    padding: 16,
    marginBottom: 18,
  },
  diaryPromptLabel: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  diaryPrompt: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2d2d',
    lineHeight: 26,
  },
  diaryDate: {
    fontSize: 12,
    color: '#5d6668',
    marginTop: 10,
    marginBottom: 12,
  },
  diaryResponse: {
    color: '#2f3b3c',
    fontSize: 16,
    lineHeight: 24,
  },
  promptCarousel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  promptChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dfe8eb',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  promptChipSelected: {
    backgroundColor: '#dff4ed',
    borderColor: '#2f8d72',
  },
  promptChipText: {
    color: '#2f3b3c',
    fontSize: 12,
    fontWeight: '600',
  },
  promptChipTextSelected: {
    color: '#1f8a68',
  },
  diaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    padding: 18,
    marginBottom: 18,
  },
  diaryHistoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    padding: 16,
    marginBottom: 14,
  },
  diaryHistoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 6,
  },
  diaryHistoryMeta: {
    fontSize: 12,
    color: '#5d6668',
    marginBottom: 8,
  },
  diaryHistoryPreview: {
    fontSize: 14,
    color: '#3e4d4d',
    lineHeight: 20,
  },
  breathingStep: {
    fontSize: 16,
    color: '#2f8d72',
    fontWeight: '700',
    marginBottom: 12,
  },
  breathingTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#edf5f3',
    borderWidth: 1,
    borderColor: '#dfe8eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 18,
  },
  breathingTimerLabel: {
    color: '#4c5d60',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  breathingTimerValue: {
    color: '#1f8a68',
    fontSize: 18,
    fontWeight: '800',
  },
  breathingActions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  breathingAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  breathingActionSecondary: {
    backgroundColor: '#edf5f3',
    borderColor: '#dfe8eb',
  },
  breathingActionPrimary: {
    backgroundColor: '#2f8d72',
    borderColor: '#2f8d72',
  },
  breathingActionSecondaryText: {
    color: '#2f3b3c',
    fontWeight: '700',
    fontSize: 15,
  },
  breathingActionPrimaryText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#2f8d72',
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 54,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    elevation: 2,
    shadowColor: '#17483d',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
