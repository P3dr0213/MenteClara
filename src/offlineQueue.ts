import * as SecureStore from 'expo-secure-store';
import { api, DiaryEntry, Mood } from './api';

export type PendingRecord =
  | { kind: 'mood'; id: string; createdAt: string; value: { tipo: string; intensidade: number; descricao?: string } }
  | { kind: 'diary'; id: string; createdAt: string; value: Pick<DiaryEntry, 'prompt' | 'resposta'> };

function key(userId: string) {
  return `com.menteclara.pending.${userId}`;
}

function utf8Size(value: string) {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, 'x').length;
}

export function createClientId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * (char === 'x' ? 16 : 4));
    return (char === 'x' ? random : 8 + random).toString(16);
  });
}

export async function getPending(userId: string): Promise<PendingRecord[]> {
  const stored = await SecureStore.getItemAsync(key(userId));
  if (!stored) return [];
  try {
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value : [];
  } catch {
    await SecureStore.deleteItemAsync(key(userId));
    return [];
  }
}

export async function queueRecord(userId: string, entry: PendingRecord) {
  const records = await getPending(userId);
  if (records.length >= 12) {
    throw new Error('A fila offline está cheia. Conecte-se e sincronize antes de criar novos registros.');
  }
  const next = [...records, entry];
  if (utf8Size(JSON.stringify(next)) > 1800) {
    throw new Error('Este registro é longo demais para a fila offline segura. Conecte-se para salvá-lo.');
  }
  await SecureStore.setItemAsync(key(userId), JSON.stringify(next), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return next;
}

export async function updatePendingMood(
  userId: string,
  id: string,
  value: { tipo: string; intensidade: number; descricao?: string },
) {
  const records = await getPending(userId);
  const index = records.findIndex(record => record.kind === 'mood' && record.id === id);
  if (index < 0 || records[index].kind !== 'mood') return false;
  const updated = [...records];
  updated[index] = { ...records[index], value };
  const serialized = JSON.stringify(updated);
  if (utf8Size(serialized) > 1800) throw new Error('A alteração excede o limite da fila offline segura.');
  await SecureStore.setItemAsync(key(userId), serialized, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return true;
}

export async function removePendingRecord(userId: string, id: string) {
  const records = await getPending(userId);
  const updated = records.filter(record => record.id !== id);
  if (updated.length === records.length) return false;
  if (updated.length) {
    await SecureStore.setItemAsync(key(userId), JSON.stringify(updated), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(key(userId));
  }
  return true;
}

export async function syncPending(userId: string, token: string) {
  const pending = await getPending(userId);
  const remaining: PendingRecord[] = [];
  let synchronized = 0;
  for (const record of pending) {
    try {
      if (record.kind === 'mood') await api.saveMood(token, { ...record.value, clientId: record.id });
      else await api.diarySave(token, { ...record.value, prompt: record.value.prompt || '', clientId: record.id });
      synchronized += 1;
    } catch {
      remaining.push(record);
      remaining.push(...pending.slice(pending.indexOf(record) + 1));
      break;
    }
  }
  if (remaining.length) {
    await SecureStore.setItemAsync(key(userId), JSON.stringify(remaining), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(key(userId));
  }
  return { synchronized, remaining };
}

export function pendingMood(record: PendingRecord): Mood | null {
  return record.kind === 'mood'
    ? { ...record.value, descricao: record.value.descricao || null, id: record.id, criado_em: record.createdAt }
    : null;
}

export function pendingDiary(record: PendingRecord): DiaryEntry | null {
  return record.kind === 'diary'
    ? { ...record.value, id: record.id, criado_em: record.createdAt }
    : null;
}
