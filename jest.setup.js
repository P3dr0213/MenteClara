/* eslint-env jest */
jest.mock('expo-secure-store', () => {
  const stored = new Map();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    setItemAsync: jest.fn(async (key, value) => {
      stored.set(key, value);
    }),
    getItemAsync: jest.fn(async key => stored.get(key) ?? null),
    deleteItemAsync: jest.fn(async key => {
      stored.delete(key);
    }),
  };
});

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: '127.0.0.1:8081' } },
}));

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
