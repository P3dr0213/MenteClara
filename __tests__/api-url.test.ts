import { resolveApiUrl } from '../src/apiUrl';

test('endereco explicito tem prioridade, inclusive para USB e tunnel', () => {
  expect(resolveApiUrl(' http://192.168.1.10:3001/ ', 'other:8081', true)).toBe(
    'http://192.168.1.10:3001',
  );
});
test('Expo Go encontra a API no computador que executa o Metro', () => {
  expect(resolveApiUrl(undefined, '192.168.1.10:8081', true)).toBe(
    'http://192.168.1.10:3001',
  );
});
test('producao exige endereco configurado', () => {
  expect(() => resolveApiUrl(undefined, null, false)).toThrow(
    'EXPO_PUBLIC_API_URL',
  );
  expect(resolveApiUrl('https://api.example.com/', null, false)).toBe(
    'https://api.example.com',
  );
});
