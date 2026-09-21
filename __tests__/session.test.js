import * as Keychain from 'react-native-keychain';
import { clearSession, getSession, saveSession } from '../src/authStorage';

beforeEach(async () => {
  await clearSession();
  jest.clearAllMocks();
});
test('sessao persiste pelo armazenamento nativo e logout a remove', async () => {
  const session = {
    token: 'token-teste',
    user: { id: 'u1', nome: 'Teste', email: 'teste@example.invalid' },
  };
  await saveSession(session);
  expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
    'session',
    JSON.stringify(session),
    expect.objectContaining({ service: 'com.menteclara.session' }),
  );
  expect(await getSession()).toEqual(session);
  await clearSession();
  expect(await getSession()).toBeNull();
});
test('sessao corrompida e descartada', async () => {
  Keychain.getGenericPassword.mockResolvedValueOnce({ password: '{invalido' });
  expect(await getSession()).toBeNull();
  expect(Keychain.resetGenericPassword).toHaveBeenCalled();
});
