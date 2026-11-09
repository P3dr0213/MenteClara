import * as SecureStore from 'expo-secure-store';
import { api, ApiError, WellbeingSnapshot } from './api';

export type WellbeingGoal = WellbeingSnapshot['goals'][number];

export type WellbeingState = WellbeingSnapshot;

const emptyState: WellbeingState = {
  reminderEnabled: false,
  reminderTime: '20:00',
  completedActivities: [],
  goals: [],
  points: 0,
  earnedBadges: [],
  updatedAt: '',
};
export function wellbeingPayload(state: WellbeingState): Omit<WellbeingState, 'updatedAt'> {
  return {
    reminderEnabled: state.reminderEnabled,
    reminderTime: state.reminderTime,
    completedActivities: state.completedActivities,
    goals: state.goals,
    points: state.points,
    earnedBadges: state.earnedBadges,
  };
}
const activityIds = new Set(['gratidao', 'pausa', 'alongamento', 'aterramento', 'pausa-corporal']);

export function parseWellbeingState(value: unknown): WellbeingState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  const activities = state.completedActivities;
  const goals = state.goals;
  const validTime = typeof state.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(state.reminderTime);
  if (typeof state.reminderEnabled !== 'boolean' || !validTime || !Array.isArray(activities) ||
    activities.length > activityIds.size || activities.some(id => typeof id !== 'string' || !activityIds.has(id)) ||
    new Set(activities).size !== activities.length || !Array.isArray(goals) || goals.length > 30 ||
    goals.some(goal => !goal || typeof goal !== 'object' || typeof goal.id !== 'string' || !/^[\w-]{1,80}$/.test(goal.id) ||
      typeof goal.title !== 'string' || !goal.title.trim() || goal.title.length > 100 ||
      !Number.isInteger(goal.target) || goal.target < 1 || goal.target > 100 ||
      !Number.isInteger(goal.progress) || goal.progress < 0 || goal.progress > goal.target) ||
    !Array.isArray(state.earnedBadges) || (state.updatedAt !== undefined && typeof state.updatedAt !== 'string')) {
    return null;
  }
  if (new Set(goals.map(goal => goal.id)).size !== goals.length) return null;
  const normalizedActivities = [...activities] as string[];
  const points = normalizedActivities.length * 10;
  return {
    reminderEnabled: state.reminderEnabled,
    reminderTime: state.reminderTime as string,
    completedActivities: normalizedActivities,
    goals: (goals as WellbeingGoal[]).map(goal => ({ ...goal, title: goal.title.trim() })),
    points,
    earnedBadges: points >= 50 ? ['constancia'] : [],
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : '',
  };
}

export function mergeWellbeingStates(current: WellbeingState, incoming: WellbeingState): WellbeingState {
  const completedActivities = [...new Set([...current.completedActivities, ...incoming.completedActivities])];
  const byId = new Map<string, WellbeingGoal>();
  [...current.goals, ...incoming.goals].forEach(goal => {
    const existing = byId.get(goal.id);
    byId.set(goal.id, existing
      ? { ...existing, progress: Math.min(existing.target, Math.max(existing.progress, goal.progress)) }
      : goal);
  });
  const points = completedActivities.length * 10;
  const currentTime = Date.parse(current.updatedAt) || 0;
  const incomingTime = Date.parse(incoming.updatedAt) || 0;
  const preferred = incomingTime > currentTime ? incoming : current;
  return {
    reminderEnabled: preferred.reminderEnabled,
    reminderTime: preferred.reminderTime,
    completedActivities,
    goals: [...byId.values()].slice(0, 30),
    points,
    earnedBadges: points >= 50 ? ['constancia'] : [],
    updatedAt: new Date(Math.max(Date.now(), currentTime, incomingTime) + 1).toISOString(),
  };
}

function storageKey(userId: string) {
  return `com.menteclara.wellbeing.${userId}`;
}

export async function loadWellbeing(userId: string): Promise<WellbeingState> {
  const value = await SecureStore.getItemAsync(storageKey(userId));
  if (!value) return emptyState;
  try {
    return parseWellbeingState(JSON.parse(value)) || emptyState;
  } catch {
    await SecureStore.deleteItemAsync(storageKey(userId));
    return emptyState;
  }
}

export async function saveWellbeing(userId: string, state: WellbeingState) {
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(state), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function reconcileWellbeing(userId: string, token: string) {
  const local = await loadWellbeing(userId);
  try {
    const { state: remote } = await api.getWellbeing(token);
    const localTime = Date.parse(local.updatedAt) || 0;
    const remoteTime = Date.parse(remote.updatedAt) || 0;
    const localHasData = local.goals.length > 0 || local.completedActivities.length > 0 || local.points > 0 || local.reminderEnabled || local.reminderTime !== '20:00';
    if (localTime > remoteTime || (remoteTime === 0 && localHasData)) {
      const state = wellbeingPayload(local);
      const saved = await api.saveWellbeing(token, state);
      await saveWellbeing(userId, saved.state);
      return saved.state;
    }
    await saveWellbeing(userId, remote);
    return remote;
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) return local;
    throw error;
  }
}

export async function syncWellbeing(userId: string, token: string) {
  return reconcileWellbeing(userId, token);
}
