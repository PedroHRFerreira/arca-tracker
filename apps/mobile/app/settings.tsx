import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import {
  ARCA_SHORT_LABELS,
  parseMoneyInput,
  validatePlanningTargets,
  type ArcaClass,
} from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import {
  exportDatabaseJson,
  getActivePlan,
  getSetting,
  getTargets,
  saveTargets,
  setSetting,
} from "@/db/database";
import { getProxyToken, setProxyToken } from "@/api/market";
import { restoreLocalBackup } from "@/db/control";
import { FINANCE_SERVICE_AVAILABLE } from "@/api/finance";
import { useApp } from "@/providers/AppProvider";
import { colors } from "@/theme";
import {
  configureReminders,
  getReminderPreferences,
  noReminders,
  type ReminderPreferences,
} from "@/notifications";

const classes: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];
export default function Settings() {
  const { refresh, syncQuotes, activePlan } = useApp();
  const [targets, setTargets] = useState<Record<ArcaClass, string>>({
    BRAZIL_STOCKS: "25",
    REAL_ESTATE: "25",
    CASH_FIXED_INCOME: "25",
    INTERNATIONAL: "25",
  });
  const [originalTargets, setOriginalTargets] = useState(targets);
  const [tolerance, setTolerance] = useState("5");
  const [token, setToken] = useState("");
  const [reminders, setReminders] = useState<ReminderPreferences>(noReminders);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const nativeNotifications =
    Platform.OS !== "web" &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const nextTargets = await getTargets();
      setTargets(nextTargets);
      setOriginalTargets(nextTargets);
      setTolerance((await getSetting("drift_tolerance")) ?? "5");
      setToken((await getProxyToken()) ?? "");
      setReminders(await getReminderPreferences());
      setLoaded(true);
    } catch {
      setMessage(
        "Não foi possível carregar as configurações. Tente novamente.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function saveAdvanced() {
    setBusy(true);
    setMessage("");
    try {
      const parsed = Object.fromEntries(
        classes.map((key) => [key, parseMoneyInput(targets[key])]),
      ) as Record<ArcaClass, string>;
      validatePlanningTargets(parsed);
      const parsedTolerance = parseMoneyInput(tolerance);
      if (Number(parsedTolerance) > 100)
        throw new Error(
          "A diferença permitida deve estar entre 0 e 100 pontos percentuais.",
        );
      const changed = classes.some(
        (key) => Number(parsed[key]) !== Number(originalTargets[key]),
      );
      if (changed) await saveTargets(parsed);
      await setSetting("drift_tolerance", parsedTolerance);
      await setProxyToken(token.trim());
      setOriginalTargets(parsed);
      await refresh();
      setMessage(
        "Configurações salvas." +
          (changed
            ? " A distribuição do seu plano agora é personalizada."
            : ""),
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.name !== "ZodError"
          ? error.message
          : "Confira os percentuais: use valores entre 0 e 100, com até duas casas decimais. A soma deve ser 100%.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleReminder(
    key: keyof ReminderPreferences,
    enabled: boolean,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const preferences = await configureReminders(
        { ...reminders, [key]: enabled },
        activePlan,
      );
      setReminders(preferences);
      setMessage(
        enabled && !preferences[key]
          ? "As notificações não foram autorizadas no aparelho. Você pode continuar usando o app e permitir os lembretes nos ajustes do sistema."
          : "Preferência de lembrete salva.",
      );
    } catch {
      setMessage("Não foi possível atualizar esse lembrete. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      const json = JSON.stringify(await exportDatabaseJson(), null, 2);
      const name = `arca-backup-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([json], { type: "application/json" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        URL.revokeObjectURL(url);
      } else {
        if (!(await Sharing.isAvailableAsync()))
          throw new Error(
            "O compartilhamento não está disponível neste aparelho.",
          );
        const path = `${FileSystem.cacheDirectory}${name}`;
        await FileSystem.writeAsStringAsync(path, json);
        await Sharing.shareAsync(path, { mimeType: "application/json" });
      }
      setMessage("Backup preparado. Guarde o arquivo em um local seguro.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível exportar seu backup.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restoreData() {
    setBusy(true);
    setMessage("");
    let restored = false;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const uri = result.assets[0]!.uri;
      const content =
        Platform.OS === "web"
          ? await (await fetch(uri)).text()
          : await FileSystem.readAsStringAsync(uri);
      await restoreLocalBackup(JSON.parse(content));
      restored = true;
      await refresh();
      await load();
      try {
        setReminders(
          await configureReminders(
            await getReminderPreferences(),
            await getActivePlan(),
            false,
          ),
        );
      } catch {
        setMessage(
          "Backup restaurado. Não foi possível reagendar os lembretes; revise suas preferências.",
        );
        return;
      }
      setMessage(
        "Backup restaurado. Seu plano, carteira e histórico foram recuperados.",
      );
    } catch {
      setMessage(
        restored
          ? "Backup restaurado. Reabra o app para atualizar a tela."
          : "Não foi possível restaurar. Confira se o arquivo é um backup ARCA Tracker válido.",
      );
    } finally {
      setBusy(false);
    }
  }
  function confirmRestore() {
    if (Platform.OS === "web") {
      if (
        window.confirm(
          "Restaurar um backup substitui os dados atuais. Exporte uma cópia antes, se precisar. Continuar?",
        )
      )
        void restoreData();
      return;
    }
    Alert.alert(
      "Restaurar seus dados?",
      "O backup substituirá os dados atuais. Exporte uma cópia antes, se precisar.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Escolher backup",
          onPress: () => {
            void restoreData();
          },
        },
      ],
    );
  }
  async function sync() {
    setBusy(true);
    setMessage("");
    try {
      await syncQuotes();
      setMessage(
        "Atualização concluída. Confira a fonte e a data das cotações na carteira; preços indisponíveis mantêm o último valor.",
      );
    } catch {
      setMessage(
        "Não foi possível atualizar agora. Seus últimos valores continuam disponíveis.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          back
          title="Configurações"
          subtitle="Seu plano, seus lembretes e seus dados"
        />
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        )}
        {!loaded && (
          <Button
            title="Carregar configurações novamente"
            variant="secondary"
            onPress={load}
          />
        )}
        <Card style={styles.card}>
          <Text style={styles.section}>Seu planejamento</Text>
          <Text style={styles.hint}>
            {activePlan
              ? activePlan.objective
              : "Defina seu objetivo e um aporte que caiba no seu dia a dia."}
          </Text>
          <Button
            title={activePlan ? "Revisar meu plano" : "Criar meu plano"}
            variant="secondary"
            onPress={() =>
              router.push(activePlan ? "/onboarding?mode=edit" : "/onboarding")
            }
          />
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Lembretes que ajudam</Text>
          {!nativeNotifications && (
            <Text style={styles.hint}>
              Lembretes locais funcionam na versão instalada do app. Não estão
              disponíveis no navegador nem no Expo Go.
            </Text>
          )}
          {(
            [
              [
                "contribution",
                "Dia do aporte",
                activePlan
                  ? "Segue o valor, a frequência e as datas do plano."
                  : "Crie um plano para escolher as datas dos aportes.",
              ],
              ["review", "Revisão do mês", "No primeiro dia do mês, às 9h."],
              [
                "history",
                "Atualização da semana",
                "Aos domingos, às 18h, para acompanhar os valores.",
              ],
            ] as const
          ).map(([key, title, hint]) => (
            <View style={styles.switchRow} key={key}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{title}</Text>
                <Text style={styles.hint}>{hint}</Text>
              </View>
              <Switch
                accessibilityLabel={title}
                value={reminders[key]}
                disabled={
                  busy ||
                  !loaded ||
                  !nativeNotifications ||
                  (key === "contribution" && !activePlan)
                }
                onValueChange={(value) => {
                  void toggleReminder(key, value);
                }}
                trackColor={{ true: colors.primary }}
              />
            </View>
          ))}
          <Text style={styles.hint}>
            Horários seguem o fuso do aparelho. Cada preferência é salva ao
            tocar no botão.
          </Text>
        </Card>
        <Card style={styles.card}>
          <Text style={styles.section}>Compras feitas na sua instituição</Text>
          <Text style={styles.hint}>
            Use o comprovante ou extrato para preparar o registro dos
            investimentos. Você confere os dados antes de salvar na carteira.
          </Text>
          <Button
            title="Importar comprovante ou extrato"
            variant="secondary"
            disabled={busy}
            onPress={() => router.push("/import-investments")}
          />
        </Card>
        {FINANCE_SERVICE_AVAILABLE && (
          <Card style={styles.card}>
            <Text style={styles.section}>Meus bancos</Text>
            <Text style={styles.hint}>
              Gerencie suas conexões e consulte saldos e investimentos dos
              bancos. Esses valores ficam separados da carteira que você
              registrou no app.
            </Text>
            <Button
              title="Abrir meus bancos"
              variant="secondary"
              onPress={() => router.push("/banks")}
            />
          </Card>
        )}
        <Card style={styles.card}>
          <Text style={styles.section}>Seus dados ficam com você</Text>
          <Text style={styles.hint}>
            Exporte uma cópia antes de trocar de aparelho. Restaurar substitui
            sua carteira, seu plano e seu histórico pelos dados do arquivo.
          </Text>
          <Button
            title="Exportar backup"
            disabled={busy}
            variant="secondary"
            onPress={exportData}
          />
          <View style={styles.space} />
          <Button
            title="Restaurar backup"
            disabled={busy}
            variant="secondary"
            onPress={confirmRestore}
          />
        </Card>
        <Button
          title={advanced ? "Fechar opções avançadas" : "Opções avançadas"}
          variant="secondary"
          onPress={() => setAdvanced((value) => !value)}
        />
        {advanced && (
          <>
            <Card style={styles.card}>
              <Text style={styles.section}>Distribuição por categoria</Text>
              <Text style={styles.hint}>
                Alterar estes percentuais torna sua estratégia personalizada.
                Para mudar objetivo, prazo ou aportes, revise seu plano.
              </Text>
              {classes.map((item) => (
                <View key={item} style={styles.targetRow}>
                  <Text style={styles.targetLabel}>
                    {ARCA_SHORT_LABELS[item]}
                  </Text>
                  <TextInput
                    accessibilityLabel={`${ARCA_SHORT_LABELS[item]} em percentual`}
                    value={targets[item]}
                    onChangeText={(value) =>
                      setTargets((current) => ({ ...current, [item]: value }))
                    }
                    keyboardType="decimal-pad"
                    style={styles.smallInput}
                  />
                  <Text style={styles.label}>%</Text>
                </View>
              ))}
            </Card>
            <Card style={styles.card}>
              <Text style={styles.section}>
                Quando avisar sobre diferenças?
              </Text>
              <TextInput
                accessibilityLabel="Diferença permitida em pontos percentuais"
                value={tolerance}
                onChangeText={setTolerance}
                keyboardType="decimal-pad"
                style={styles.input}
              />
              <Text style={styles.hint}>
                Diferença permitida em pontos percentuais entre a distribuição
                atual e a meta. Exemplo: meta de 25% e limite de 5 pontos avisa
                abaixo de 20% ou acima de 30%.
              </Text>
            </Card>
            <Card style={styles.card}>
              <Text style={styles.section}>Acesso às cotações</Text>
              <TextInput
                accessibilityLabel="Token pessoal de acesso às cotações"
                value={token}
                onChangeText={setToken}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
              />
              <Text style={styles.hint}>
                Token pessoal do serviço de cotações, guardado com segurança no
                aparelho. A chave do provedor permanece no servidor.
              </Text>
              <Button
                title="Atualizar cotações agora"
                variant="secondary"
                disabled={busy}
                onPress={sync}
              />
            </Card>
            <Button
              title={busy ? "Salvando…" : "Salvar opções avançadas"}
              disabled={busy || !loaded}
              onPress={saveAdvanced}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 80 },
  section: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 10,
  },
  card: { marginVertical: 10 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  targetLabel: { flex: 1, color: colors.ink, fontSize: 14 },
  smallInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    minWidth: 70,
    minHeight: 48,
    padding: 10,
    textAlign: "right",
    color: colors.ink,
  },
  input: {
    backgroundColor: colors.background,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 48,
    padding: 12,
    marginBottom: 10,
  },
  message: {
    color: colors.primary,
    backgroundColor: "#E8EEE5",
    borderRadius: 10,
    padding: 14,
    lineHeight: 22,
    marginBottom: 10,
  },
  space: { height: 10 },
});
