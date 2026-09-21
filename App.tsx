import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { api, ApiError, Session, setUnauthorizedHandler } from './src/api';
import { clearSession, getSession, saveSession } from './src/authStorage';
import {
  validateLoginForm,
  validateRegisterForm,
  validateProfileUpdateForm,
} from './src/auth';
import { validateMoodEntry } from './src/mood';
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
  | 'emergencia'
  | 'chatIa';
const moods = ['triste', 'ansioso', 'feliz', 'calmo', 'motivado'];
const intensityLabels = ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Muito alta'];
function message(error: unknown) {
  return error instanceof Error ? error.message : 'Tente novamente.';
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
  const currentToken = useRef<string | null>(null);

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
    case 'respiracao':
      content = (
        <>
          <Text style={styles.title}>Respiração</Text>
          <Text style={styles.text}>
            Inspire por 4 segundos e expire por 6.
          </Text>
          {button('Voltar', () => setScreen('home'))}
        </>
      );
      break;
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
