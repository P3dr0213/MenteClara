/* eslint-env jest */
jest.mock('react-native-keychain', () => {
  let stored = false;
  return {
    ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' },
    setGenericPassword: jest.fn(async (username, password) => {
      stored = { username, password };
      return true;
    }),
    getGenericPassword: jest.fn(async () => stored),
    resetGenericPassword: jest.fn(async () => {
      stored = false;
      return true;
    }),
  };
});

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
