export function resolveApiUrl(
  configuredUrl: string | undefined,
  hostUri: string | null | undefined,
  development: boolean,
): string {
  if (configuredUrl?.trim()) {
    return configuredUrl.trim().replace(/\/+$/, '');
  }
  // Expo Go on the same Wi-Fi uses the computer running Metro as the API host.
  if (development && hostUri) {
    const host = hostUri
      .replace(/^[a-z]+:\/\//i, '')
      .split('/')[0]
      .replace(/:\d+$/, '');
    return `http://${host}:3001`;
  }
  if (development) {
    return 'http://127.0.0.1:3001';
  }
  throw new Error('Configure EXPO_PUBLIC_API_URL antes de gerar o aplicativo.');
}
