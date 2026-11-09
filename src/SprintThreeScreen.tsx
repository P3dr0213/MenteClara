import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, DataBackup } from './api';
import { getPending, syncPending } from './offlineQueue';
import { loadWellbeing, mergeWellbeingStates, parseWellbeingState, saveWellbeing, syncWellbeing, WellbeingState } from './wellbeing';

type Props = { userId: string; token: string; darkMode: boolean; onSaveReflection: (text: string) => Promise<void> };
type Report = { total: number; average: string; moods: Record<string, number> };

function reportFromBackup(backup: DataBackup): Report {
  const counts: Record<string, number> = {};
  backup.registrosHumor.forEach(record => { counts[record.tipo] = (counts[record.tipo] || 0) + 1; });
  const average = backup.registrosHumor.length
    ? (backup.registrosHumor.reduce((sum, record) => sum + record.intensidade, 0) / backup.registrosHumor.length).toFixed(1)
    : '—';
  return { total: backup.registrosHumor.length, average, moods: counts };
}

export default function SprintThreeScreen({ userId, token, darkMode, onSaveReflection }: Props) {
  const [pendingCount, setPendingCount] = useState(0);
  const [situation, setSituation] = useState('');
  const [thought, setThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [evidenceFor, setEvidenceFor] = useState('');
  const [evidenceAgainst, setEvidenceAgainst] = useState('');
  const [balancedThought, setBalancedThought] = useState('');
  const [action, setAction] = useState('');
  const [backupText, setBackupText] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const theme = darkMode
    ? { background: '#101827', surface: '#1f2937', text: '#f3f4f6', muted: '#cbd5e1', border: '#334155', accent: '#3fbf9f', soft: '#1f3b35' }
    : { background: '#f3f5f7', surface: '#ffffff', text: '#1f2d2d', muted: '#5d6668', border: '#dfe8eb', accent: '#2d7a67', soft: '#eaf8f2' };

  useEffect(() => {
    getPending(userId).then(records => setPendingCount(records.length)).catch(() => setPendingCount(0));
  }, [userId]);

  const card = (title: string, body: string) => <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.body, { color: theme.muted }]}>{body}</Text></View>;
  const button = (title: string, onPress: () => void, secondary = false) => <Pressable accessibilityRole="button" disabled={busy} onPress={onPress} style={[styles.button, { backgroundColor: secondary ? theme.soft : theme.accent, borderColor: theme.border }]}><Text style={[styles.buttonText, { color: secondary ? theme.accent : '#fff' }]}>{title}</Text></Pressable>;
  const input = (label: string, value: string, setValue: (next: string) => void, multiline = false) => <TextInput accessibilityLabel={label} value={value} onChangeText={setValue} placeholder={label} placeholderTextColor={theme.muted} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} style={[styles.input, multiline && styles.multiline, { color: theme.text, borderColor: theme.border }]} />;

  async function synchronize() {
    setBusy(true);
    try {
      const result = await syncPending(userId, token);
      await syncWellbeing(userId, token);
      setPendingCount(result.remaining.length);
      Alert.alert('Sincronização concluída', `${result.synchronized} registro(s) enviados. ${result.remaining.length} pendente(s).`);
    } catch (error) {
      Alert.alert('Sincronização indisponível', error instanceof Error ? error.message : 'Tente novamente quando estiver conectado.');
    } finally { setBusy(false); }
  }

  async function shareBackup() {
    setBusy(true);
    let generatedFile: File | null = null;
    try {
      const backup = await api.exportData(token);
      const pending = await getPending(userId);
      const wellbeing = await loadWellbeing(userId);
      const pendingMoods = pending.filter(record => record.kind === 'mood').map(record => ({
        ...record.value, id: record.id, criado_em: record.createdAt,
      }));
      const pendingDiary = pending.filter(record => record.kind === 'diary').map(record => ({
        ...record.value, id: record.id, criado_em: record.createdAt,
      }));
      const payload = {
        ...backup,
        bemEstar: wellbeing,
        registrosHumor: [...backup.registrosHumor, ...pendingMoods],
        registrosDiario: [...backup.registrosDiario, ...pendingDiary],
      };
      const filename = `mente-clara-backup-${new Date().toISOString().slice(0, 10)}.json`;
      generatedFile = new File(Paths.cache, filename);
      if (generatedFile.exists) generatedFile.delete();
      generatedFile.create();
      generatedFile.write(JSON.stringify(payload, null, 2));
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
      }
      await Sharing.shareAsync(generatedFile.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Exportar backup Mente Clara' });
    } catch (error) {
      Alert.alert('Não foi possível exportar', error instanceof Error ? error.message : 'Conecte-se à internet e tente novamente.');
    } finally {
      try { if (generatedFile?.exists) generatedFile.delete(); } catch { /* Cache cleanup is best effort. */ }
      setBusy(false);
    }
  }

  async function importBackup(rawText: string) {
    let parsed: DataBackup;
    let restoredWellbeing: WellbeingState | null = null;
    try {
      parsed = JSON.parse(rawText);
      if (parsed.format !== 'mente-clara-backup-v1' || !Array.isArray(parsed.registrosHumor) || !Array.isArray(parsed.registrosDiario)) throw new Error('Formato inválido');
      if (parsed.bemEstar !== undefined) {
        restoredWellbeing = parseWellbeingState(parsed.bemEstar);
        if (!restoredWellbeing) throw new Error('Preferências de bem-estar inválidas');
      }
    } catch {
      Alert.alert('Backup inválido', 'Cole um JSON de backup Mente Clara válido.');
      return;
    }
    Alert.alert('Confirmar restauração', `O arquivo contém ${parsed.registrosHumor.length} registro(s) de humor, ${parsed.registrosDiario.length} entrada(s) de diário e ${restoredWellbeing?.goals.length || 0} meta(s). Os dados atuais serão mesclados; itens já importados deste backup serão ignorados.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', onPress: () => { setBusy(true); api.restoreData(token, parsed).then(async result => {
        if (restoredWellbeing) {
          const current = await loadWellbeing(userId);
          await saveWellbeing(userId, mergeWellbeingStates(current, restoredWellbeing));
          await syncWellbeing(userId, token);
        }
        Alert.alert('Backup restaurado', `${result.registrosImportados} registro(s) adicionados e ${result.registrosIgnorados} duplicado(s) ignorado(s).`);
      }).catch(error => Alert.alert('Falha ao restaurar', error.message)).finally(() => setBusy(false)); } },
    ]);
  }

  async function pickBackup() {
    try {
      const selected = await File.pickFileAsync({ mimeTypes: ['application/json'] });
      if (selected.canceled || !selected.result) return;
      await importBackup(await selected.result.text());
    } catch (error) {
      Alert.alert('Não foi possível abrir o arquivo', error instanceof Error ? error.message : 'Escolha um arquivo JSON válido.');
    }
  }

  async function loadReport() {
    setBusy(true);
    try { setReport(reportFromBackup(await api.exportData(token))); }
    catch (error) { Alert.alert('Relatório indisponível', error instanceof Error ? error.message : 'Tente novamente.'); }
    finally { setBusy(false); }
  }

  async function saveReflection() {
    const fields = [situation, thought, emotion, evidenceFor, evidenceAgainst, balancedThought, action];
    if (fields.some(value => !value.trim())) { Alert.alert('Complete as etapas', 'Preencha cada etapa antes de salvar a reflexão.'); return; }
    const text = `Situação: ${situation.trim()}\n\nPensamento automático: ${thought.trim()}\n\nEmoção: ${emotion.trim()}\n\nEvidências que apoiam o pensamento: ${evidenceFor.trim()}\n\nEvidências que oferecem outra perspectiva: ${evidenceAgainst.trim()}\n\nPensamento mais equilibrado: ${balancedThought.trim()}\n\nPróxima ação cuidadosa: ${action.trim()}`;
    if (text.length > 5000) { Alert.alert('Reflexão muito longa', 'Reduza o texto para até 5.000 caracteres para salvar no diário.'); return; }
    try { await onSaveReflection(text); Alert.alert('Reflexão salva', 'O exercício foi adicionado ao seu diário.'); setSituation(''); setThought(''); setEmotion(''); setEvidenceFor(''); setEvidenceAgainst(''); setBalancedThought(''); setAction(''); }
    catch (error) { Alert.alert('Não foi possível salvar', error instanceof Error ? error.message : 'Tente novamente.'); }
  }

  return <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>Dados e progresso</Text>
    {card('Uso offline', pendingCount ? `${pendingCount} registro(s) aguardando conexão. Eles estão guardados com segurança neste aparelho.` : 'Se a conexão cair ao registrar humor ou diário, a entrada fica guardada neste aparelho até sincronizar.')}
    {button(busy ? 'Aguarde…' : `Sincronizar agora${pendingCount ? ` · ${pendingCount}` : ''}`, synchronize)}
    {card('Exportar e fazer backup', 'Gere um arquivo JSON com registros de humor, diário, práticas, metas e registros offline pendentes.')}
    {button('Gerar e compartilhar arquivo JSON', shareBackup, true)}
    {card('Restaurar backup', 'Escolha um arquivo JSON exportado pelo Mente Clara. A prévia de quantidades e a deduplicação aparecem antes da confirmação.')}
    {button('Escolher arquivo de backup', pickBackup, true)}
    {card('Importação manual', 'Se preferir, cole aqui o conteúdo JSON do backup.')}
    {input('Cole aqui o JSON do backup', backupText, setBackupText, true)}
    {button('Restaurar dados colados', () => importBackup(backupText), true)}
    {card('Relatório emocional', 'Resumo baseado nos registros de humor salvos na sua conta. Não é diagnóstico nem avaliação clínica.')}
    {button('Atualizar relatório', loadReport, true)}
    {report ? <>
      {card('Resumo geral', `${report.total} registros · intensidade média ${report.average} de 5`)}
      {Object.keys(report.moods).length ? Object.entries(report.moods).map(([mood, count]) => card(mood, `${count} registro(s)`)) : card('Sem dados', 'Registre seu humor para começar a acompanhar sua evolução.')}
    </> : null}
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>Exercício de reflexão</Text>
    {card('Uma etapa por vez', 'Este exercício de reflexão inspirado em técnicas de TCC é educativo e não substitui terapia. Você pode pausar ou deixar qualquer etapa para depois.')}
    {input('1. Situação: o que aconteceu?', situation, setSituation, true)}
    {input('2. Pensamento automático: o que passou pela sua mente?', thought, setThought, true)}
    {input('3. Emoção e intensidade percebida', emotion, setEmotion, true)}
    {input('4. O que apoia esse pensamento?', evidenceFor, setEvidenceFor, true)}
    {input('5. O que oferece outra perspectiva?', evidenceAgainst, setEvidenceAgainst, true)}
    {input('6. Qual pensamento mais equilibrado considera os dois lados?', balancedThought, setBalancedThought, true)}
    {input('7. Qual próximo passo cuidadoso você pode escolher?', action, setAction, true)}
    {button('Salvar reflexão no diário', saveReflection)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { padding: 20, paddingBottom: 36 },
  title: { fontSize: 27, fontWeight: '800', marginBottom: 14 }, sectionTitle: { fontSize: 21, fontWeight: '800', marginTop: 18, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 }, cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 7 }, body: { fontSize: 15, lineHeight: 22 },
  button: { minHeight: 48, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', padding: 12, marginBottom: 12 }, buttonText: { fontSize: 15, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 }, multiline: { minHeight: 90 },
});
