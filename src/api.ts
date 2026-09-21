export type User = { id: string; nome: string; email: string };
export type Session = { token: string; user: User };
export type Mood = {
  id: string;
  tipo: string;
  intensidade: number;
  descricao: string | null;
  criado_em: string;
};
export type Period = 'week' | 'month';

// USB: adb reverse tcp:3001 tcp:3001. Funciona no aparelho e no emulador.
export const API_URL = 'http://127.0.0.1:3001';
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
  logout: (token: string) => request<void>('/api/auth/logout', 'POST', token),
  saveMood: (
    token: string,
    body: { tipo: string; intensidade: number; descricao?: string },
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
};
