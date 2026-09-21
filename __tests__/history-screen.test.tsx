import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import HistoryScreen from '../src/HistoryScreen';
import { api } from '../src/api';

let tree: Renderer.ReactTestRenderer;
afterEach(async () => {
  if (tree) {
    await act(async () => tree.unmount());
  }
  jest.restoreAllMocks();
});
test('historico exibe registros reais e grafico, sem mensagem vazia', async () => {
  jest
    .spyOn(api, 'history')
    .mockResolvedValue({
      registros: [
        {
          id: 'm1',
          tipo: 'calmo',
          intensidade: 3,
          descricao: 'Caminhada pela manha',
          criado_em: '2026-09-20T12:00:00Z',
        },
      ],
    });
  await act(async () => {
    tree = Renderer.create(<HistoryScreen token="token" onBack={() => {}} />);
  });
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain('Caminhada pela manha');
  expect(rendered).toContain('Intensidade média por dia');
  expect(rendered).not.toContain('Sem registros neste período');
});
test('historico diferencia erro de vazio e permite repetir', async () => {
  const history = jest
    .spyOn(api, 'history')
    .mockRejectedValueOnce(new Error('Sem conexao'))
    .mockResolvedValue({ registros: [] });
  await act(async () => {
    tree = Renderer.create(<HistoryScreen token="token" onBack={() => {}} />);
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Sem conexao');
  expect(JSON.stringify(tree.toJSON())).not.toContain(
    'Sem registros neste período',
  );
  let retry = tree.root.findAll(
    node => node.props.children === 'Tentar novamente',
  )[0];
  while (retry && typeof retry.props.onPress !== 'function') {
    retry = retry.parent!;
  }
  await act(async () => {
    await retry.props.onPress();
  });
  expect(history).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(tree.toJSON())).toContain(
    'Sem registros neste período',
  );
});
