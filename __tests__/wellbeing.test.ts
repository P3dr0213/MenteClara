import * as SecureStore from 'expo-secure-store';
import { api } from '../src/api';
import { loadWellbeing, mergeWellbeingStates, parseWellbeingState, reconcileWellbeing, saveWellbeing } from '../src/wellbeing';

const state = {
  reminderEnabled: false,
  reminderTime: '20:00',
  completedActivities: ['gratidao'],
  goals: [{ id: 'goal-1', title: 'Pausa diária', target: 5, progress: 2 }],
  points: 10,
  earnedBadges: [],
  updatedAt: '2026-10-01T00:00:00.000Z',
};

test('valida e deriva pontuação de atividades, sem confiar em pontos importados', () => {
  expect(parseWellbeingState({ ...state, points: 900, earnedBadges: ['constancia'] })?.points).toBe(10);
  expect(parseWellbeingState({ ...state, reminderTime: '99:99' })).toBeNull();
});

test('mescla metas e atividades sem regredir progresso', () => {
  const current = { ...state, goals: [{ ...state.goals[0], progress: 4 }] };
  const incoming = { ...state, goals: [{ ...state.goals[0], progress: 2 }], completedActivities: ['pausa'] };
  const merged = mergeWellbeingStates(current, incoming);
  expect(merged.goals[0].progress).toBe(4);
  expect(merged.completedActivities).toEqual(['gratidao', 'pausa']);
  expect(merged.points).toBe(20);
});

test('mantém e sincroniza estado de bem-estar por usuário', async () => {
  await SecureStore.deleteItemAsync('com.menteclara.wellbeing.user-a');
  await saveWellbeing('user-a', state);
  expect(await loadWellbeing('user-a')).toEqual(state);

  jest.spyOn(api, 'getWellbeing').mockResolvedValueOnce({
    state: { ...state, reminderTime: '08:00', updatedAt: '2026-10-02T00:00:00.000Z' },
  });
  const reconciled = await reconcileWellbeing('user-a', 'token-a');
  expect(reconciled.reminderTime).toBe('08:00');
  expect(await loadWellbeing('user-b')).not.toEqual(reconciled);
  jest.restoreAllMocks();
});
