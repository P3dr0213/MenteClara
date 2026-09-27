import * as SecureStore from 'expo-secure-store';
import {
  clearSession,
  getSession,
  getTheme,
  saveSession,
  saveTheme,
} from '../src/authStorage';

beforeEach(async () => {
  await clearSession();
  jest.clearAllMocks();
});

test('sessao persiste pelo armazenamento seguro e logout a remove', async () => {
  const session = {
    token: 'token-teste',
    user: { id: 'u1', nome: 'Teste', email: 'teste@example.invalid' },
  };
  await saveSession(session);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    'com.menteclara.session',
    JSON.stringify(session),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  expect(await getSession()).toEqual(session);
  await clearSession();
  expect(await getSession()).toBeNull();
});

test.each(['{invalido', 'null', '{"token":"","user":{"id":"u1"}}'])(
  'sessao corrompida e descartada: %s',
  async value => {
    SecureStore.getItemAsync.mockResolvedValueOnce(value);
    expect(await getSession()).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  },
);

test('falha no armazenamento seguro impede aceitar a sessao', async () => {
  SecureStore.setItemAsync.mockRejectedValueOnce(
    new Error('Storage unavailable'),
  );
  await expect(
    saveSession({ token: 'abc', user: { id: 'u1' } }),
  ).rejects.toThrow('Storage unavailable');
  expect(await getSession()).toBeNull();
});

test('tema escuro persiste sem substituir a sessao', async () => {
  const session = { token: 'abc', user: { id: 'u1' } };
  await saveSession(session);
  await saveTheme('dark');
  expect(await getTheme()).toBe('dark');
  expect(await getSession()).toEqual(session);
});
