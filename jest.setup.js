/* eslint-env jest */
jest.mock('expo-secure-store', () => {
  let stored = null;
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
    setItemAsync: jest.fn(async (key, value) => {
      stored = value;
    }),
    getItemAsync: jest.fn(async () => stored),
    deleteItemAsync: jest.fn(async () => {
      stored = null;
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
