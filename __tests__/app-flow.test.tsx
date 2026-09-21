import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import App from '../App';
import { api, ApiError } from '../src/api';
import { clearSession, saveSession, getSession } from '../src/authStorage';

const user = { id: 'u1', nome: 'Maria', email: 'maria@example.invalid' };
let tree: Renderer.ReactTestRenderer;
async function mount() {
  await act(async () => {
    tree = Renderer.create(<App />);
  });
}
async function press(label: string) {
  let target = tree.root.findAll(node => node.props.children === label)[0];
  while (target && typeof target.props.onPress !== 'function') {
    target = target.parent!;
  }
  if (!target) {
    throw new Error('Botao ausente: ' + label);
  }
  await act(async () => {
    await target!.props.onPress();
  });
}
beforeEach(async () => {
  await clearSession();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(api, 'profile').mockResolvedValue({ user });
  jest.spyOn(api, 'history').mockResolvedValue({ registros: [] });
});
afterEach(async () => {
  if (tree) {
    await act(async () => tree.unmount());
  }
  jest.restoreAllMocks();
});
test('login usa API, abre perfil real e logout limpa sessao', async () => {
  const login = jest
    .spyOn(api, 'login')
    .mockResolvedValue({ token: 'token-real', user });
  const logout = jest.spyOn(api, 'logout').mockResolvedValue(undefined);
  await mount();
  await act(async () => {
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === 'Email')!
      .props.onChangeText(user.email);
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === 'Senha')!
      .props.onChangeText('Senha@123');
  });
  await press('Entrar');
  expect(login).toHaveBeenCalledWith({
    email: user.email,
    password: 'Senha@123',
  });
  expect((await getSession()).token).toBe('token-real');
  await press('Perfil');
  expect(api.profile).toHaveBeenCalledWith('token-real');
  await press('Sair da conta');
  expect(logout).toHaveBeenCalledWith('token-real');
  expect(await getSession()).toBeNull();
});
test('restaura sessao, atualiza perfil e consulta historico filtrado', async () => {
  await saveSession({ token: 'persistido', user });
  const update = jest.spyOn(api, 'updateProfile').mockResolvedValue({
    user: { ...user, nome: 'Maria Nova' },
    message: 'ok',
  });
  await mount();
  expect(api.profile).toHaveBeenCalledWith('persistido');
  await press('Perfil');
  await press('Editar perfil');
  await act(async () => {
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === 'Nome do perfil')!
      .props.onChangeText('Maria Nova');
  });
  await press('Salvar alterações');
  expect(update).toHaveBeenCalledWith('persistido', {
    name: 'Maria Nova',
    email: user.email,
  });
  expect((await getSession()).user.nome).toBe('Maria Nova');
  await press('Histórico');
  expect(api.history).toHaveBeenCalledWith('persistido', 'week');
  await press('Últimos 30 dias');
  expect(api.history).toHaveBeenCalledWith('persistido', 'month');
});

test('registra humor com sessao real e abre historico', async () => {
  await saveSession({ token: 'persistido', user });
  const save = jest
    .spyOn(api, 'saveMood')
    .mockResolvedValue({
      registro: {
        id: 'm1',
        tipo: 'feliz',
        intensidade: 4,
        descricao: 'Dia bom',
        criado_em: '2026-09-20T12:00:00Z',
      },
      message: 'ok',
    });
  await mount();
  await press('Humor');
  await act(async () => {
    tree.root
      .findAllByType(TextInput)
      .find(node => node.props.accessibilityLabel === 'Descrição do humor')!
      .props.onChangeText('Dia bom');
  });
  await press('Salvar registro');
  expect(save).toHaveBeenCalledWith('persistido', {
    tipo: 'feliz',
    intensidade: 4,
    descricao: 'Dia bom',
  });
  expect(api.history).toHaveBeenCalledWith('persistido', 'week');
});
test('sessao expirada retorna ao login sem manter credenciais', async () => {
  await saveSession({ token: 'expirado', user });
  jest.mocked(api.profile).mockRejectedValueOnce(new ApiError('Expirou', 401));
  await mount();
  expect(await getSession()).toBeNull();
  expect(
    tree.root
      .findAllByType(TextInput)
      .some(node => node.props.accessibilityLabel === 'Senha'),
  ).toBe(true);
});
test('falha de rede na restauracao permite tentar novamente sem perder sessao', async () => {
  await saveSession({ token: 'persistido', user });
  jest.mocked(api.profile).mockRejectedValueOnce(new ApiError('Sem rede', 0));
  await mount();
  expect((await getSession()).token).toBe('persistido');
  await press('Tentar novamente');
  await press('Perfil');
  expect(api.profile).toHaveBeenCalledWith('persistido');
});
