import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View, ActivityIndicator, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { toQR } from 'toqr';
import { api, Friend } from './api';

type Props = { token: string; darkMode: boolean; onBack: () => void };

export default function FriendsScreen({ token, darkMode, onBack }: Props) {
  const [code, setCode] = useState('');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendCode, setFriendCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [error, setError] = useState('');
  const palette = darkMode
    ? { background: '#111A18', surface: '#1C2925', text: '#F0F5F2', muted: '#AFC0B9', border: '#344840', accent: '#75C7A8', accentSoft: '#23443A', danger: '#E5A09A' }
    : { background: '#F5F7F4', surface: '#FFFFFF', text: '#24332F', muted: '#65746F', border: '#E0E8E2', accent: '#2F7563', accentSoft: '#E2F0E9', danger: '#B65A51' };

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, codeResult] = await Promise.all([api.getFriends(token), api.getFriendCode(token)]);
      setFriends(result.friends);
      setCode(codeResult.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas amizades.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const matrix = useMemo(() => {
    if (!code) return [];
    const content = code;
    const bytes = new Uint8Array(Array.from(content, character => character.charCodeAt(0)));
    return Array.from(toQR(bytes));
  }, [code]);
  const qrSize = Math.sqrt(matrix.length);

  async function addFriend() {
    const normalized = friendCode.trim().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
      setError('Digite o código de amizade completo que aparece no QR da outra pessoa.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await api.addFriend(token, normalized);
      setFriendCode('');
      setFriends(current => current.some(friend => friend.id === result.friend.id) ? current : [...current, { ...result.friend, criado_em: new Date().toISOString() }].sort((a, b) => a.nome.localeCompare(b.nome)));
      Alert.alert('Amizade adicionada', `${result.friend.nome} agora está na sua lista.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar essa amizade.');
    } finally {
      setSaving(false);
    }
  }

  function removeFriend(friend: Friend) {
    Alert.alert('Remover amizade?', `Remover ${friend.nome} da lista de vocês?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: async () => {
        try {
          await api.removeFriend(token, friend.id);
          setFriends(current => current.filter(item => item.id !== friend.id));
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível remover a amizade.');
        }
      } },
    ]);
  }

  const button = (label: string, onPress: () => void, secondary = false, disabled = false) => (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [
      styles.button,
      { backgroundColor: secondary ? palette.surface : palette.accent, borderColor: secondary ? palette.border : palette.accent },
      disabled && styles.disabled,
      pressed && !disabled && styles.pressed,
    ]}>
      <Text style={[styles.buttonText, { color: secondary ? palette.accent : '#FFFFFF' }]}>{label}</Text>
    </Pressable>
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.container, { backgroundColor: palette.background }]}>
      {button('‹  Voltar ao perfil', onBack, true)}
      <Text style={[styles.title, { color: palette.text }]}>Amizades</Text>
      <Text style={[styles.subtitle, { color: palette.muted }]}>Conecte-se com pessoas que você conhece e escolha com quem compartilhar seu espaço.</Text>

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Seu QR de amizade</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Mostre este código para alguém. A pessoa pode ler o QR e digitar o código abaixo para adicionar você.</Text>
        {loading ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : code ? (
          <>
            <View accessibilityLabel="QR code de amizade" style={styles.qrWrap}>
              {Array.from({ length: qrSize }, (_, row) => (
                <View key={row} style={[styles.qrRow, { height: 216 / qrSize }]}>
                  {Array.from({ length: qrSize }, (_, column) => (
                    <View key={column} style={[styles.qrCell, { backgroundColor: matrix[row * qrSize + column] ? '#10201B' : '#FFFFFF' }]} />
                  ))}
                </View>
              ))}
            </View>
            <Text selectable style={[styles.code, { color: palette.text }]}>{code}</Text>
            <Text style={[styles.caption, { color: palette.muted, textAlign: 'center' }]}>Toque e segure o código para selecioná-lo e copiá-lo.</Text>
          </>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Adicionar amizade</Text>
        <Text style={[styles.caption, { color: palette.muted }]}>Leia o QR da outra pessoa ou digite o código de amizade.</Text>
        {scannerOpen ? (
          <View>
            {cameraPermission?.granted ? (
              <>
                <CameraView
                  style={styles.camera}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => {
                    setFriendCode(data.trim());
                    setScannerOpen(false);
                    setError('');
                  }}
                />
                <Text style={[styles.caption, { color: palette.muted, textAlign: 'center', marginTop: 8 }]}>Aponte a câmera para o QR de amizade.</Text>
              </>
            ) : (
              <>
                <Text style={[styles.caption, { color: palette.muted }]}>{cameraPermission?.canAskAgain === false ? 'Permita o acesso à câmera nas configurações do aparelho para ler o QR.' : 'Precisamos da câmera para ler o QR code.'}</Text>
                {cameraPermission?.canAskAgain !== false ? button('Permitir câmera', requestCameraPermission) : null}
              </>
            )}
            {button('Fechar leitor', () => setScannerOpen(false), true)}
          </View>
        ) : button('Ler QR code', async () => {
          if (!cameraPermission?.granted) {
            const result = await requestCameraPermission();
            if (!result.granted) {
              setScannerOpen(true);
              return;
            }
          }
          setScannerOpen(true);
        }, true, saving || loading)}
        <TextInput
          accessibilityLabel="Código de amizade"
          autoCapitalize="none"
          autoCorrect={false}
          value={friendCode}
          onChangeText={setFriendCode}
          placeholder="00000000-0000-4000-8000-000000000000"
          placeholderTextColor={palette.muted}
          style={[styles.input, { backgroundColor: palette.background, borderColor: palette.border, color: palette.text }]}
        />
        {button(saving ? 'Adicionando…' : 'Adicionar amigo', addFriend, false, saving || loading)}
      </View>

      <View style={[styles.listHeader, { borderBottomColor: palette.border }]}>
        <Text style={[styles.cardTitle, { color: palette.text }]}>Sua lista</Text>
        <Text style={[styles.count, { color: palette.muted }]}>{friends.length}</Text>
      </View>
      {loading ? <ActivityIndicator color={palette.accent} style={styles.loader} /> : friends.length ? friends.map(friend => (
        <View key={friend.id} style={[styles.friendRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={[styles.avatar, { backgroundColor: palette.accentSoft }]}>
            <Text style={[styles.avatarText, { color: palette.accent }]}>{friend.nome.trim().charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={[styles.friendName, { color: palette.text }]} numberOfLines={1}>{friend.nome}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${friend.nome}`} onPress={() => removeFriend(friend)} hitSlop={10}>
            <Text style={[styles.remove, { color: palette.danger }]}>Remover</Text>
          </Pressable>
        </View>
      )) : (
        <Text style={[styles.empty, { color: palette.muted }]}>Sua lista ainda está vazia. Compartilhe seu QR para começar.</Text>
      )}
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 36 },
  title: { fontSize: 30, fontWeight: '800', marginTop: 14, marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 18 },
  card: { borderWidth: 1, borderRadius: 22, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  caption: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  loader: { marginVertical: 18 },
  qrWrap: { alignSelf: 'center', width: 280, height: 280, padding: 32, backgroundColor: '#FFFFFF', borderRadius: 16, marginVertical: 6 },
  qrRow: { flexDirection: 'row' },
  qrCell: { flex: 1 },
  camera: { width: '100%', height: 280, borderRadius: 16, overflow: 'hidden' },
  code: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 12, letterSpacing: 0.3 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, marginBottom: 4, fontSize: 13 },
  button: { minHeight: 50, borderRadius: 15, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingBottom: 8, marginBottom: 10 },
  count: { fontSize: 14, fontWeight: '700' },
  friendRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, paddingHorizontal: 12, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: '800' },
  friendName: { flex: 1, fontSize: 15, fontWeight: '700', marginRight: 8 },
  remove: { fontSize: 12, fontWeight: '700' },
  empty: { fontSize: 14, lineHeight: 21, paddingVertical: 12 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 12 },
});
