import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { clearSession, getSession, saveSession } from './src/authStorage';
import {
  validateLoginForm,
  validateRegisterForm,
  validateProfileUpdateForm,
} from './src/auth';
import { validateMoodEntry } from './src/mood';
import { DIARY_PROMPTS, validateDiaryEntry } from './src/diary';
import HistoryScreen from './src/HistoryScreen';

type Screen =
  | 'login'
  | 'cadastro'
  | 'home'
  | 'perfil'
  | 'editarPerfil'
  | 'humor'
  | 'historico'
  | 'respiracao'
  | 'diario'
  | 'diarioNova'
  | 'diarioDetalhes'
  | 'diarioEditar'
  | 'diarioExcluir'
  | 'emergencia'
  | 'chatIa';
const moods = ['triste', 'ansioso', 'feliz', 'calmo', 'motivado'];
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
  const [screen, setScreen] = useState<Screen>('humor');
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
  const [diaryPrompt, setDiaryPrompt] = useState(DIARY_PROMPTS[0]);
  const [useDiaryPrompt, setUseDiaryPrompt] = useState(true);
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
    try {
      const stored: Session | null = await getSession();
      if (stored) {
        const result = await api.profile(stored.token);
        await acceptSession({ token: stored.token, user: result.user });
        setScreen('humor');
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await resetSession();
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
    loadDiaryHistory();
  }, [screen, session?.token]);

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
    setLoading(true);
    try {
      await api.saveMood(token, validation.normalized);
      if (currentToken.current !== token) {
        return;
      }
      setDescription('');
      setMoodType('feliz');
      setIntensity(4);
      setScreen('historico');
      Alert.alert('Sucesso', 'Registro salvo.');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadDiaryHistory() {
    if (!session?.token) {
      return;
    }
    setDiaryLoading(true);
    try {
      const result = await api.diaryHistory(session.token);
      setDiaryEntries(result.registros);
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setDiaryLoading(false);
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
    try {
      const result = await api.diarySave(session.token, validation.normalized);
      const nextEntry = result.registro;
      setDiaryEntries(current => [nextEntry, ...current]);
      setDiaryText('');
      setDiaryTitle('');
      setDiaryPrompt(DIARY_PROMPTS[0]);
      setUseDiaryPrompt(true);
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

  function resetDiaryDraft() {
    setDiaryTitle('');
    setDiaryText('');
    setDiaryMood('bem');
    setDiaryPrompt(DIARY_PROMPTS[0]);
    setUseDiaryPrompt(true);
  }
  const isDarkMode = themeMode === 'dark';
  const theme = isDarkMode
    ? {
        background: '#101827',
        surface: '#1f2937',
        surfaceAlt: '#0f172a',
        text: '#f3f4f6',
        textMuted: '#cbd5e1',
        border: '#334155',
        accent: '#3fbf9f',
        accentSoft: '#1f3b35',
        danger: '#ef4444',
        tabBackground: '#111827',
        tabInactive: '#94a3b8',
      }
    : {
        background: '#f3f5f7',
        surface: '#ffffff',
        surfaceAlt: '#edf9f4',
        text: '#1f2d2d',
        textMuted: '#5d6668',
        border: '#dfe8eb',
        accent: '#2d7a67',
        accentSoft: '#eaf8f2',
        danger: '#d93025',
        tabBackground: '#ffffff',
        tabInactive: '#586b6f',
      };
  const button = (label: string, onPress: () => void, secondary = false) => (
    <Pressable
      accessibilityRole="button"
      disabled={loading}
      style={[
        secondary ? styles.secondaryButton : styles.button,
        loading && styles.buttonDisabled,
      ]}
      onPress={onPress}
    >
      <Text style={secondary ? styles.secondaryButtonText : styles.buttonText}>
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
            <View style={styles.loginBrandWrap}>
              <Text style={styles.loginBrand}>MenteClara</Text>
            </View>
            <Text style={styles.loginTitle}>
              {screen === 'cadastro' ? 'Criar conta' : 'Bem-vindo de volta'}
            </Text>
            <Text style={styles.loginSubtitle}>
              Acompanhe seu bem-estar e cuide da sua mente todos os dias.
            </Text>
            {screen === 'cadastro' ? (
              <>
                <Text style={styles.label}>Nome</Text>
                <TextInput
                  accessibilityLabel="Nome"
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  maxLength={120}
                  editable={!loading}
                  placeholder="Seu nome"
                />
              </>
            ) : null}
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              maxLength={254}
              editable={!loading}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="seu@email.com"
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              accessibilityLabel="Senha"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              editable={!loading}
              secureTextEntry
              placeholder="Sua senha"
            />
            {screen === 'cadastro' ? (
              <Text style={styles.cardText}>
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
    { key: 'triste', label: 'Muito mal', emoji: '😞' },
    { key: 'ansioso', label: 'Mal', emoji: '😕' },
    { key: 'calmo', label: 'Normal', emoji: '😐' },
    { key: 'feliz', label: 'Bem', emoji: '🙂' },
    { key: 'motivado', label: 'Muito bem', emoji: '😄' },
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
          { key: 'home', icon: '🏠' },
          { key: 'humor', icon: '😊' },
          { key: 'historico', icon: '📊' },
          { key: 'respiracao', icon: '🌬️' },
          { key: 'diario', icon: '📝' },
          { key: 'perfil', icon: '👤' },
        ] as const
      ).map(({ key, icon }) => (
        <Pressable
          accessibilityRole="button"
          key={key}
          disabled={loading}
          onPress={() => setScreen(key)}
          style={screen === key ? styles.tabItemActive : styles.tabItem}
        >
          <Text style={screen === key ? styles.tabTextActive : styles.tabText}>
            {icon}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (screen === 'historico') {
    return (
      <HistoryScreen token={session.token} onBack={() => setScreen('home')} />
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
              onPress={() => {
                setDiaryEntries(current =>
                  current.filter(item => item.id !== selectedDiaryEntry.id),
                );
                setSelectedDiaryEntry(null);
                setScreen('diario');
              }}
            >
              <Text style={styles.deleteButtonText}>Excluir entrada</Text>
            </Pressable>
            <Pressable
              style={[
                styles.cancelButton,
                { backgroundColor: theme.accentSoft },
              ]}
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
            value={diaryTitle || selectedDiaryEntry.prompt || ''}
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
            value={selectedDiaryEntry.resposta}
            onChangeText={value => {
              if (selectedDiaryEntry) {
                setSelectedDiaryEntry({
                  ...selectedDiaryEntry,
                  resposta: value,
                });
              }
            }}
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
              if (!selectedDiaryEntry) {
                return;
              }
              setDiaryEntries(current =>
                current.map(item =>
                  item.id === selectedDiaryEntry.id
                    ? {
                        ...item,
                        prompt: diaryTitle || selectedDiaryEntry.prompt,
                        resposta: selectedDiaryEntry.resposta,
                      }
                    : item,
                ),
              );
              setScreen('diarioDetalhes');
            }}
          >
            <Text style={styles.primaryButtonText}>Salvar alterações</Text>
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

          <View style={styles.emergencyCard}>
            <Text style={styles.emergencyBadge}>CVV</Text>
            <Text style={styles.emergencyPhone}>188</Text>
            <Text style={styles.emergencyText}>
              Ligue imediatamente em caso de risco, crise ou se precisar de
              apoio emocional urgente.
            </Text>
          </View>

          {button('Ligar para CVV', () => Linking.openURL('tel:188'))}
          {button('Chat com IA', () => setScreen('chatIa'))}
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
          <Text style={[styles.title, { color: theme.text }]}>Chat com IA</Text>

          <View style={styles.aiBubble}>
            <Text style={styles.aiText}>
              Olá! Posso te ajudar a respirar, organizar seus pensamentos e te
              orientar em momentos de tensão.
            </Text>
          </View>

          <View style={styles.quickActions}>
            <Pressable
              style={styles.quickAction}
              onPress={() =>
                Alert.alert(
                  'IA',
                  'Tente inspirar por 4 segundos e expirar por 6, repetindo por 5 ciclos.',
                )
              }
            >
              <Text style={styles.quickActionText}>Respirar</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() =>
                Alert.alert(
                  'IA',
                  'Você não está sozinho(a). Posso te ajudar a organizar uma rotina mais tranquila.',
                )
              }
            >
              <Text style={styles.quickActionText}>Apoio</Text>
            </Pressable>
            <Pressable
              style={styles.quickAction}
              onPress={() => setScreen('emergencia')}
            >
              <Text style={styles.quickActionText}>Emergência</Text>
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
          <Text style={styles.title}>Perfil</Text>
          {profileLoading ? (
            <ActivityIndicator accessibilityLabel="Atualizando perfil" />
          ) : null}
          {profileError ? (
            <>
              <Text accessibilityRole="alert">{profileError}</Text>
              {button(
                'Tentar novamente',
                () => setProfileReload(value => value + 1),
                true,
              )}
            </>
          ) : null}
          <Text style={styles.text}>Nome: {session.user.nome}</Text>
          <Text style={styles.text}>Email: {session.user.email}</Text>
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
              onPress={() =>
                setThemeMode(current =>
                  current === 'light' ? 'dark' : 'light',
                )
              }
            >
              <Text style={styles.buttonText}>
                {isDarkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}
              </Text>
            </Pressable>
          </View>
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
          <Text style={styles.title}>Editar perfil</Text>
          <Text style={styles.label}>Nome</Text>
          <TextInput
            accessibilityLabel="Nome do perfil"
            style={styles.input}
            value={profileForm.name}
            maxLength={120}
            editable={!loading}
            onChangeText={value =>
              setProfileForm(current => ({ ...current, name: value }))
            }
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Email do perfil"
            style={styles.input}
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
          <Text style={styles.title}>Registro de humor</Text>
          <Text style={styles.label}>Como você está se sentindo?</Text>
          <View style={styles.optionGrid}>
            {moods.map(mood => (
              <Pressable
                key={mood}
                accessibilityRole="button"
                accessibilityState={{ selected: moodType === mood }}
                disabled={loading}
                onPress={() => setMoodType(mood)}
                style={[
                  styles.optionButton,
                  moodType === mood && styles.optionButtonSelected,
                ]}
              >
                <Text style={styles.optionText}>
                  {mood.charAt(0).toUpperCase() + mood.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Intensidade</Text>
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
                  intensity === level && styles.sliderButtonSelected,
                ]}
              >
                <Text
                  style={[
                    styles.sliderText,
                    intensity === level && styles.sliderTextSelected,
                  ]}
                >
                  {level}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.moodIntensityText}>
            {intensityLabels[intensity - 1]}
          </Text>
          <Text style={styles.label}>Descrição opcional</Text>
          <TextInput
            accessibilityLabel="Descrição do humor"
            style={styles.textArea}
            multiline
            maxLength={280}
            editable={!loading}
            value={description}
            onChangeText={setDescription}
            placeholder="Conte o que aconteceu hoje..."
          />
          {button(loading ? 'Salvando...' : 'Salvar registro', saveMood)}
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
            <Text style={styles.breathingTitle}>Pausa para respirar</Text>
            <Text style={styles.breathingSubtitle}>
              Um minuto para voltar ao presente.
            </Text>

            <View style={styles.breathingCircleOuter}>
              <Animated.View
                style={[
                  styles.breathingCircleInner,
                  { transform: [{ scale: breathingScale }] },
                ]}
              >
                <Text style={styles.breathingText}>{activePhase.label}</Text>
                <Text style={styles.breathingTextSecondary}>
                  {activePhase.hint}
                </Text>
              </Animated.View>
            </View>

            <Text style={styles.breathingStep}>
              Etapa {breathingPhaseIndex + 1} de {breathingPhases.length} ·{' '}
              {formatBreathingTimer(breathingTimeLeft)}
            </Text>

            <View style={styles.breathingTimerRow}>
              <Text style={styles.breathingTimerLabel}>Cronômetro</Text>
              <Text style={styles.breathingTimerValue}>
                {formatBreathingTimer(breathingTimeLeft)}
              </Text>
            </View>

            <View style={styles.breathingActions}>
              <Pressable
                style={[
                  styles.breathingAction,
                  styles.breathingActionSecondary,
                ]}
                onPress={handlePauseBreathing}
              >
                <Text style={styles.breathingActionSecondaryText}>
                  {isBreathingPaused ? 'Continuar' : 'Pausar'}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.breathingAction, styles.breathingActionPrimary]}
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
            </View>
            <Pressable
              accessibilityRole="button"
              style={[
                styles.homeSosButton,
                {
                  backgroundColor: isDarkMode ? '#3b1f1e' : '#fff1f0',
                  borderColor: isDarkMode ? '#7f1d1d' : '#f5b5b0',
                },
              ]}
              onPress={() => setScreen('emergencia')}
            >
              <Text
                style={[
                  styles.homeSosText,
                  { color: isDarkMode ? '#fca5a5' : '#d93025' },
                ]}
              >
                SOS
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.homeGreeting, { color: theme.text }]}>
            Olá, {session.user.nome} 👋
          </Text>
          <Text style={[styles.homeSubGreeting, { color: theme.textMuted }]}>
            Como você está se sentindo hoje?
          </Text>

          <View
            style={[
              styles.homeMoodCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
              Humor de hoje
            </Text>
            <View style={styles.moodQuickGrid}>
              {quickMoodOptions.map(option => (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
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

                    try {
                      await api.saveMood(session.token, validation.normalized);
                    } catch (error) {
                      Alert.alert('Erro', message(error));
                    }
                  }}
                  style={[
                    styles.moodQuickButton,
                    moodType === option.key && styles.moodQuickButtonSelected,
                  ]}
                >
                  <Text style={styles.moodQuickEmoji}>{option.emoji}</Text>
                  <Text
                    style={[
                      styles.moodQuickText,
                      moodType === option.key && styles.moodQuickTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.homeMoodSummaryRow}>
              <Text style={styles.homeMoodSummaryText}>
                Hoje você está se sentindo {selectedMoodMeta.emoji}{' '}
                {selectedMoodMeta.label}
              </Text>
              <Pressable onPress={() => setScreen('humor')}>
                <Text style={styles.homeMoodLink}>Alterar</Text>
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
              style={styles.primaryButton}
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
              style={styles.emergencyFab}
              onPress={() => setScreen('emergencia')}
            >
              <Text style={styles.emergencyFabText}>SOS</Text>
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
    backgroundColor: '#f3f5f7',
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
    marginBottom: 12,
  },
  emergencyFab: {
    backgroundColor: '#d93025',
    borderRadius: 18,
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#d93025',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  emergencyFabText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 18,
    letterSpacing: 0.7,
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
    backgroundColor: '#f3f5f7',
    padding: 24,
    paddingBottom: 30,
  },
  moodContainer: {
    flexGrow: 1,
    backgroundColor: '#f3f5f7',
    padding: 24,
    paddingBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2d2d',
    marginBottom: 12,
    marginTop: 8,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  optionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dfe8eb',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  optionButtonSelected: {
    backgroundColor: '#dff4ed',
    borderColor: '#2f8d72',
  },
  optionText: {
    color: '#2f3b3c',
    fontWeight: '600',
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
    minHeight: 120,
    textAlignVertical: 'top',
    padding: 14,
    color: '#1f2d2d',
    marginBottom: 18,
  },
  primaryButton: {
    backgroundColor: '#2d7a67',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
  },
  secondaryButtonText: {
    color: '#2f8d72',
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e7eef1',
    paddingTop: 6,
    paddingBottom: 14,
    paddingHorizontal: 6,
    justifyContent: 'space-around',
    marginTop: -14,
    minHeight: 60,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  tabItem: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
  },
  tabItemActive: {
    flex: 1,
    backgroundColor: '#eaf5f0',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 10,
    minHeight: 38,
    justifyContent: 'center',
  },
  tabText: {
    color: '#586b6f',
    fontWeight: '600',
    fontSize: 18,
  },
  tabTextActive: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 18,
  },
  homeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  homeBrand: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f2d2d',
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
    fontSize: 28,
    fontWeight: '800',
    color: '#1f2d2d',
    marginBottom: 4,
  },
  homeSubGreeting: {
    fontSize: 15,
    color: '#5d6668',
    marginBottom: 18,
  },
  homeMoodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
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
    marginTop: 8,
    marginBottom: 12,
  },
  moodQuickButton: {
    width: '31%',
    backgroundColor: '#f4f7f8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e7edf0',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    marginBottom: 8,
  },
  moodQuickButtonSelected: {
    backgroundColor: '#eaf8f2',
    borderColor: '#a7dfc8',
  },
  moodQuickEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  moodQuickText: {
    fontSize: 11,
    color: '#4d5d5f',
    fontWeight: '700',
    textAlign: 'center',
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
    borderRadius: 22,
    padding: 18,
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
    marginBottom: 20,
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
    minHeight: 120,
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
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
