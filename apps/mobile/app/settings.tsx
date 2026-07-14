import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { ARCA_SHORT_LABELS, type ArcaClass } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import {
  exportDatabaseJson,
  getSetting,
  getTargets,
  restoreDatabaseJson,
  saveTargets,
  setSetting,
} from "@/db/database";
import { getProxyToken, setProxyToken } from "@/api/market";
import { useApp } from "@/providers/AppProvider";
import { colors } from "@/theme";
import { configureLocalReminders } from "@/notifications";

const classes: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];
export default function Settings() {
  const { refresh, syncQuotes } = useApp();
  const [targets, setTargets] = useState<Record<ArcaClass, string>>({
    BRAZIL_STOCKS: "25",
    REAL_ESTATE: "25",
    CASH_FIXED_INCOME: "25",
    INTERNATIONAL: "25",
  });
  const [tolerance, setTolerance] = useState("5");
  const [token, setToken] = useState("");
  const [reminders, setReminders] = useState(false);
  useEffect(() => {
    async function loadSettings() {
      const nextTargets = await getTargets();
      const nextTolerance = await getSetting("drift_tolerance");
      const nextToken = await getProxyToken();
      const enabled = await getSetting("notifications_enabled");
      setTargets(nextTargets);
      setTolerance(nextTolerance ?? "5");
      setToken(nextToken ?? "");
      setReminders(enabled === "true");
    }
    loadSettings().catch(console.error);
  }, []);
  const total = Object.values(targets).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );
  async function save() {
    if (total !== 100)
      return Alert.alert("Metas inválidas", "As metas precisam somar 100%.");
    const notificationsEnabled = await configureLocalReminders(reminders);
    await saveTargets(targets);
    await setSetting("drift_tolerance", tolerance);
    await setProxyToken(token);
    await setSetting(
      "notifications_enabled",
      String(notificationsEnabled),
    );
    setReminders(notificationsEnabled);
    await refresh();
    Alert.alert("Configurações salvas");
  }
  async function exportData() {
    const json = JSON.stringify(await exportDatabaseJson(), null, 2);
    const path = `${FileSystem.cacheDirectory}arca-backup-${new Date().toISOString().slice(0, 10)}.json`;
    await FileSystem.writeAsStringAsync(path, json);
    await Sharing.shareAsync(path, { mimeType: "application/json" });
  }
  async function restoreData() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const content = await FileSystem.readAsStringAsync(result.assets[0]!.uri);
      await restoreDatabaseJson(JSON.parse(content));
      await refresh();
      Alert.alert(
        "Backup restaurado",
        "Os dados foram validados e restaurados.",
      );
    } catch {
      Alert.alert(
        "Backup inválido",
        "O arquivo não corresponde a um backup ARCA Tracker válido.",
      );
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Configurações"
          subtitle="Metas, sincronização e backup"
        />
        <Card>
          <Text style={styles.section}>Metas por quadrante</Text>
          {classes.map((item) => (
            <View key={item} style={styles.targetRow}>
              <Text style={styles.targetLabel}>{ARCA_SHORT_LABELS[item]}</Text>
              <TextInput
                value={targets[item]}
                onChangeText={(value) =>
                  setTargets({ ...targets, [item]: value })
                }
                keyboardType="decimal-pad"
                style={styles.smallInput}
              />
              <Text>%</Text>
            </View>
          ))}
          <Text
            style={[styles.total, total !== 100 && { color: colors.danger }]}
          >
            Total: {total}%
          </Text>
        </Card>
        <Card style={styles.cardGap}>
          <Text style={styles.section}>Tolerância de drift</Text>
          <TextInput
            value={tolerance}
            onChangeText={setTolerance}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Alerta quando o desvio ultrapassar este valor em pontos percentuais.
          </Text>
        </Card>
        <Card style={styles.cardGap}>
          <Text style={styles.section}>Token pessoal do proxy</Text>
          <TextInput
            value={token}
            onChangeText={setToken}
            secureTextEntry
            autoCapitalize="none"
            style={styles.input}
          />
          <Text style={styles.hint}>
            Guardado no SecureStore do aparelho; a chave brapi permanece no
            Worker.
          </Text>
          <Button
            title="Sincronizar agora"
            variant="secondary"
            onPress={syncQuotes}
          />
        </Card>
        <Card style={styles.cardGap}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.section}>Lembretes locais</Text>
              <Text style={styles.hint}>
                Revisão mensal e lembrete semanal de snapshot.
              </Text>
            </View>
            <Switch
              value={reminders}
              onValueChange={setReminders}
              trackColor={{ true: colors.primary }}
            />
          </View>
        </Card>
        <Button title="Salvar configurações" onPress={save} />
        <View style={{ height: 10 }} />
        <Button
          title="Exportar backup JSON"
          variant="secondary"
          onPress={exportData}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Restaurar backup JSON"
          variant="secondary"
          onPress={restoreData}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  section: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 17,
    marginBottom: 12,
  },
  targetRow: { flexDirection: "row", alignItems: "center", paddingVertical: 7 },
  targetLabel: { flex: 1, color: colors.ink, fontWeight: "700" },
  smallInput: {
    backgroundColor: colors.background,
    borderRadius: 8,
    minWidth: 54,
    padding: 8,
    textAlign: "right",
    marginRight: 4,
    fontWeight: "800",
  },
  total: {
    color: colors.success,
    textAlign: "right",
    fontWeight: "900",
    marginTop: 8,
  },
  cardGap: { marginVertical: 12 },
  switchRow: { flexDirection: "row", alignItems: "center" },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  hint: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 12 },
});
