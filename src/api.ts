import Constants from 'expo-constants';
import { resolveApiUrl } from './apiUrl';

export type User = { id: string; nome: string; email: string };
export type Session = { token: string; user: User };
export type Mood = {
  id: string;
  tipo: string;
  intensidade: number;
  descricao: string | null;
  criado_em: string;
};
export type DiaryEntry = {
  id: string;
  prompt: string | null;
  resposta: string;
  criado_em: string;
};
export type Friend = { id: string; nome: string; criado_em: string };
export type Period = 'week' | 'month';
export type DataBackup = {
  format: 'mente-clara-backup-v1';
  exportedAt: string;
  registrosHumor: Mood[];
  registrosDiario: DiaryEntry[];
  bemEstar?: Record<string, unknown>;
};
export type WellbeingSnapshot = {
  reminderEnabled: boolean;
  reminderTime: string;
  completedActivities: string[];
  goals: { id: string; title: string; target: number; progress: number }[];
  points: number;
  earnedBadges: string[];
  updatedAt: string;
};

export const API_URL = resolveApiUrl(
  process.env.EXPO_PUBLIC_API_URL,
  Constants.expoConfig?.hostUri,
  __DEV__,
);
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
let onUnauthorized: ((token: string) => void) | undefined;
export function setUnauthorizedHandler(handler?: (token: string) => void) {
  onUnauthorized = handler;
}
async function request<T>(
  path: string,
  method = 'GET',
  token?: string,
  body?: unknown,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(API_URL + path, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? undefined : await response.json();
    if (!response.ok) {
      if (response.status === 401 && token) {
        onUnauthorized?.(token);
      }
      throw new ApiError(
        data?.message || 'Não foi possível concluir a operação.',
        response.status,
      );
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      'Não foi possível conectar. Confira sua conexão e tente novamente.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}
export const api = {
  login: (body: { email: string; password: string }) =>
    request<Session>('/api/auth/login', 'POST', undefined, body),
  register: (body: { name: string; email: string; password: string }) =>
    request<Session>('/api/auth/register', 'POST', undefined, body),
  profile: (token: string) =>
    request<{ user: User }>('/api/user/profile', 'GET', token),
  updateProfile: (token: string, body: { name: string; email: string }) =>
    request<{ user: User; message: string }>(
      '/api/user/profile',
      'PUT',
      token,
      body,
    ),
  getFriendCode: (token: string) =>
    request<{ code: string }>('/api/friends/code', 'GET', token),
  getFriends: (token: string) =>
    request<{ friends: Friend[] }>('/api/friends', 'GET', token),
  addFriend: (token: string, code: string) =>
    request<{ friend: Pick<Friend, 'id' | 'nome'>; message: string }>('/api/friends', 'POST', token, { code }),
  removeFriend: (token: string, id: string) =>
    request<void>('/api/friends/' + id, 'DELETE', token),
  logout: (token: string) => request<void>('/api/auth/logout', 'POST', token),
  saveMood: (
    token: string,
    body: { tipo: string; intensidade: number; descricao?: string; clientId?: string },
  ) =>
    request<{ registro: Mood; message: string }>(
      '/api/mood/register',
      'POST',
      token,
      body,
    ),
  history: (token: string, period: Period) =>
    request<{ registros: Mood[] }>(
      '/api/mood/history?period=' + period,
      'GET',
      token,
    ),
  updateMood: (token: string, id: string, body: { tipo: string; intensidade: number; descricao?: string }) =>
    request<{ registro: Mood; message: string }>(`/api/mood/${id}`, 'PUT', token, body),
  deleteMood: (token: string, id: string) =>
    request<void>(`/api/mood/${id}`, 'DELETE', token),
  diarySave: (token: string, body: { prompt: string; resposta: string; clientId?: string }) =>
    request<{ registro: DiaryEntry; message: string }>(
      '/api/diary/register',
      'POST',
      token,
      body,
    ),
  diaryHistory: (token: string) =>
    request<{ registros: DiaryEntry[] }>('/api/diary/history', 'GET', token),
  diaryUpdate: (
    token: string,
    id: string,
    body: { prompt: string; resposta: string },
  ) =>
    request<{ registro: DiaryEntry }>('/api/diary/' + id, 'PUT', token, body),
  diaryDelete: (token: string, id: string) =>
    request<void>('/api/diary/' + id, 'DELETE', token),
  diaryGet: (token: string, id: string) =>
    request<{ registro: DiaryEntry }>('/api/diary/' + id, 'GET', token),
  exportData: (token: string) =>
    request<DataBackup>('/api/data/export', 'GET', token),
  restoreData: (token: string, backup: DataBackup) =>
    request<{ message: string; registrosImportados: number; registrosIgnorados: number }>(
      '/api/data/restore', 'POST', token, backup,
    ),
  getWellbeing: (token: string) =>
    request<{ state: WellbeingSnapshot }>('/api/user/wellbeing', 'GET', token),
  saveWellbeing: (token: string, state: Omit<WellbeingSnapshot, 'updatedAt'>) =>
    request<{ state: WellbeingSnapshot }>('/api/user/wellbeing', 'PUT', token, state),
};
