import * as Keychain from 'react-native-keychain';

const options = { service: 'com.menteclara.session' };
export async function saveSession(session) {
  const saved = await Keychain.setGenericPassword(
    'session',
    JSON.stringify(session),
    {
      ...options,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
  if (!saved) {
    throw new Error('Não foi possível salvar a sessão no aparelho.');
  }
  return session;
}
export async function getSession() {
  const stored = await Keychain.getGenericPassword(options);
  if (!stored) {
    return null;
  }
  try {
    const session = JSON.parse(stored.password);
    if (typeof session.token !== 'string' || !session.user?.id) {
      throw new Error('Sessão inválida');
    }
    return session;
  } catch {
    await clearSession();
    return null;
  }
}
export async function clearSession() {
  await Keychain.resetGenericPassword(options);
}
