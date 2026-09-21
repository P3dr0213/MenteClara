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
  | 'diarioDetalhes'
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
  const [diaryText, setDiaryText] = useState('');
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [selectedDiaryEntry, setSelectedDiaryEntry] =
    useState<DiaryEntry | null>(null);
  const [diaryLoading, setDiaryLoading] = useState(false);
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
    const validation = validateDiaryEntry({
      prompt: useDiaryPrompt ? diaryPrompt : '',
      usePrompt: useDiaryPrompt,
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
      setDiaryPrompt(DIARY_PROMPTS[0]);
      setUseDiaryPrompt(true);
      setScreen('diario');
      setSelectedDiaryEntry(nextEntry);
      Alert.alert('Sucesso', 'Registro do diário salvo.');
    } catch (error) {
      Alert.alert('Erro', message(error));
    } finally {
      setLoading(false);
    }
  }
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
      <SafeAreaView style={styles.screenBox}>
        {booting ? (
          <ActivityIndicator accessibilityLabel="Carregando sessão" />
        ) : (
          <>
            <Text style={styles.title}>Não foi possível conectar</Text>
            <Text>{bootError}</Text>
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
        style={styles.safeArea}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.loginContainer}
        >
          <View style={styles.loginCard}>
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
  if (screen === 'historico') {
    return (
      <HistoryScreen token={session.token} onBack={() => setScreen('home')} />
    );
  }
  if (screen === 'diarioDetalhes' && selectedDiaryEntry) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.profileContainer}>
          <Text style={styles.title}>Registro do diário</Text>
          <View style={styles.diaryCard}>
            <Text style={styles.diaryPromptLabel}>Pergunta</Text>
            <Text style={styles.diaryPrompt}>{selectedDiaryEntry.prompt}</Text>
            <Text style={styles.diaryDate}>
              {new Date(selectedDiaryEntry.criado_em).toLocaleString('pt-BR')}
            </Text>
            <Text style={styles.diaryResponse}>
              {selectedDiaryEntry.resposta}
            </Text>
          </View>
          {button('Voltar', () => setScreen('diario'), true)}
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (screen === 'diario') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.profileContainer}>
          <Text style={styles.title}>Diário</Text>

          <View style={styles.diaryToggleRow}>
            <Text style={styles.label}>Pergunta guiada</Text>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ selected: useDiaryPrompt }}
              style={[
                styles.diaryToggle,
                useDiaryPrompt && styles.diaryToggleActive,
              ]}
              onPress={() => setUseDiaryPrompt(current => !current)}
            >
              <View
                style={[
                  styles.diaryToggleThumb,
                  useDiaryPrompt && styles.diaryToggleThumbActive,
                ]}
              />
            </Pressable>
          </View>

          {useDiaryPrompt ? (
            <>
              <View style={styles.diaryPromptBox}>
                <Text style={styles.diaryPromptLabel}>Sugestão</Text>
                <Text style={styles.diaryPrompt}>{diaryPrompt}</Text>
              </View>
              <View style={styles.promptCarousel}>
                {DIARY_PROMPTS.map(prompt => (
                  <Pressable
                    key={prompt}
                    style={[
                      styles.promptChip,
                      diaryPrompt === prompt && styles.promptChipSelected,
                    ]}
                    onPress={() => setDiaryPrompt(prompt)}
                  >
                    <Text
                      style={[
                        styles.promptChipText,
                        diaryPrompt === prompt && styles.promptChipTextSelected,
                      ]}
                    >
                      {prompt}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.cardText}>
              Pergunta guiada desativada. Você pode escrever livremente no seu
              diário.
            </Text>
          )}

          <Text style={styles.label}>Seu registro</Text>
          <TextInput
            accessibilityLabel="Texto do diário"
            style={styles.textArea}
            multiline
            maxLength={5000}
            value={diaryText}
            onChangeText={setDiaryText}
            placeholder="Escreva o que aconteceu, como você se sentiu e o que você precisa lembrar..."
          />
          {button(loading ? 'Salvando...' : 'Salvar no diário', saveDiaryEntry)}
          <Text style={styles.sectionLabel}>Histórico</Text>
          {diaryLoading ? (
            <ActivityIndicator accessibilityLabel="Carregando diário" />
          ) : diaryEntries.length === 0 ? (
            <Text style={styles.cardText}>
              Ainda não há registros neste diário.
            </Text>
          ) : (
            diaryEntries.map(entry => (
              <Pressable
                key={entry.id}
                style={styles.diaryHistoryCard}
                onPress={() => {
                  setSelectedDiaryEntry(entry);
                  setScreen('diarioDetalhes');
                }}
              >
                <Text style={styles.diaryHistoryTitle}>
                  {entry.prompt || 'Registro sem pergunta'}
                </Text>
                <Text style={styles.diaryHistoryMeta}>
                  {new Date(entry.criado_em).toLocaleString('pt-BR')}
                </Text>
                <Text style={styles.diaryHistoryPreview} numberOfLines={3}>
                  {entry.resposta}
                </Text>
              </Pressable>
            ))
          )}
          {button('Voltar', () => setScreen('home'), true)}
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (screen === 'emergencia') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.profileContainer}>
          <Text style={styles.title}>Emergência</Text>

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
          {button('Voltar', () => setScreen('home'), true)}
        </ScrollView>
      </SafeAreaView>
    );
  }
  if (screen === 'chatIa') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.profileContainer}>
          <Text style={styles.title}>Chat com IA</Text>

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

          {button('Voltar', () => setScreen('home'), true)}
        </ScrollView>
      </SafeAreaView>
    );
  }
  const tabs = (
    <View style={styles.tabBar}>
      {(['home', 'historico', 'perfil'] as const).map(tab => (
        <Pressable
          accessibilityRole="button"
          key={tab}
          disabled={loading}
          onPress={() => setScreen(tab)}
          style={screen === tab ? styles.tabItemActive : styles.tabItem}
        >
          <Text style={screen === tab ? styles.tabTextActive : styles.tabText}>
            {tab === 'home'
              ? 'Home'
              : tab === 'historico'
              ? 'Histórico'
              : 'Perfil'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
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
          <View style={styles.heroCard}>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.userName}>{session.user.nome}</Text>
            <Text style={styles.heroText}>
              Como você está se sentindo hoje? Reserve um momento para cuidar de
              você.
            </Text>
          </View>
          <Text style={styles.sectionLabel}>Seu espaço de cuidado</Text>
          {(
            [
              ['humor', 'Humor', 'Registrar como você está se sentindo'],
              ['historico', 'Histórico', 'Visualizar registros e evolução'],
              ['respiracao', 'Respiração', 'Acessar exercícios'],
              ['diario', 'Diário', 'Registrar pensamentos e reflexões'],
              ['perfil', 'Perfil', 'Seus dados e configurações'],
            ] as const
          ).map(([target, title, subtitle]) => (
            <Pressable
              key={target}
              accessibilityRole="button"
              style={[styles.card, target === 'humor' && styles.cardAccent]}
              onPress={() => setScreen(target)}
            >
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardText}>{subtitle}</Text>
            </Pressable>
          ))}
        </>
      );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.profileContainer}
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
      {tabs}
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
    borderTopColor: '#dfe8eb',
    paddingTop: 8,
    paddingBottom: 22,
    paddingHorizontal: 12,
    justifyContent: 'space-around',
    marginTop: -18,
    minHeight: 82,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 50,
    justifyContent: 'center',
  },
  tabItemActive: {
    flex: 1,
    backgroundColor: '#eaf5f0',
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    minHeight: 50,
    justifyContent: 'center',
  },
  tabText: {
    color: '#586b6f',
    fontWeight: '600',
    fontSize: 12,
  },
  tabTextActive: {
    color: '#1f8a68',
    fontWeight: '700',
    fontSize: 12,
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
