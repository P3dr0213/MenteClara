import * as SecureStore from 'expo-secure-store';

const key = 'com.menteclara.session';
const themeKey = 'com.menteclara.theme';
const options = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveSession(session) {
  await SecureStore.setItemAsync(key, JSON.stringify(session), options);
  return session;
}

export async function getSession() {
  const stored = await SecureStore.getItemAsync(key);
  if (!stored) {
    return null;
  }
  try {
    const session = JSON.parse(stored);
    if (
      typeof session?.token !== 'string' ||
      !session.token ||
      !session.user?.id
    ) {
      throw new Error('Sessão inválida');
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(key);
}

export async function saveTheme(theme) {
  await SecureStore.setItemAsync(themeKey, theme, options);
}

export async function getTheme() {
  const theme = await SecureStore.getItemAsync(themeKey);
  return theme === 'dark' ? 'dark' : 'light';
}
