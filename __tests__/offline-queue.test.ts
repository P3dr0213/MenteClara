import * as SecureStore from 'expo-secure-store';
import { api } from '../src/api';
import { createClientId, getPending, queueRecord, syncPending } from '../src/offlineQueue';

const userId = 'offline-queue-test';

beforeEach(async () => {
  await SecureStore.deleteItemAsync('com.menteclara.pending.' + userId);
  jest.restoreAllMocks();
});

test('gera identificadores UUID para sincronização idempotente', () => {
  expect(createClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('sincroniza cada registro usando o mesmo identificador e remove a fila', async () => {
  const id = createClientId();
  await queueRecord(userId, {
    kind: 'mood', id, createdAt: new Date().toISOString(),
    value: { tipo: 'calmo', intensidade: 3, descricao: 'Registro offline' },
  });
  const save = jest.spyOn(api, 'saveMood').mockResolvedValueOnce({
    registro: { id, tipo: 'calmo', intensidade: 3, descricao: 'Registro offline', criado_em: new Date().toISOString() },
    message: 'Registro já sincronizado.',
  });
  const result = await syncPending(userId, 'token');
  expect(save).toHaveBeenCalledWith('token', expect.objectContaining({ clientId: id }));
  expect(result).toEqual({ synchronized: 1, remaining: [] });
  expect(await getPending(userId)).toEqual([]);
});

test('preserva registros pendentes se a API falhar', async () => {
  const id = createClientId();
  const record = {
    kind: 'diary' as const, id, createdAt: new Date().toISOString(),
    value: { prompt: 'Diário', resposta: 'Entrada feita sem conexão.' },
  };
  await queueRecord(userId, record);
  jest.spyOn(api, 'diarySave').mockRejectedValueOnce(new Error('offline'));
  const result = await syncPending(userId, 'token');
  expect(result.remaining).toEqual([record]);
  expect(await getPending(userId)).toEqual([record]);
});
