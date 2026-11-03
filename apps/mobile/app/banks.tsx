import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getFinanceTotals, prepareFinanceTrades, type FinanceSnapshot } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import {
  FINANCE_SERVICE_AVAILABLE,
  disconnectFinance,
  getFinanceAccessStatus,
  saveFinanceAccessKey,
  syncFinance,
} from "@/api/finance";
import {
  commitFinanceImport,
  getFinanceAutoImport,
  loadFinanceSnapshot,
  previewFinanceImport,
  setFinanceAutoImport,
} from "@/db/finance";
import { useApp } from "@/providers/AppProvider";
import { colors, layout } from "@/theme";

type ImportPreview = Awaited<ReturnType<typeof previewFinanceImport>>;
type Busy = "loading" | "sync" | "connect" | "import" | "preference" | "disconnect" | null;
const connectionLabels = {
  UPDATED: "Atualizado",
  UPDATING: "Atualização em andamento",
  LOGIN_REQUIRED: "Autorize novamente no MeuPluggy",
  ERROR: "Não foi possível atualizar este banco",
} as const;
const investmentLabels = {
  EQUITY: "Ação", ETF: "ETF", FII: "Fundo imobiliário",
  FIXED_INCOME: "Renda fixa", FUND: "Fundo", OTHER: "Outro investimento",
} as const;
const formatMoney = (value: string, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value));
const formatTime = (value: string | null) => value
  ? new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
  : "Data não informada";
const formatTradeDate = (value: string) => value.split("-").reverse().join("/");
const safeFinanceErrors = new Set([
  "A conexão pessoal ainda não foi configurada para esta versão.",
  "Chave de acesso inválida. Confira a chave pessoal da conexão.",
  "Muitas consultas em pouco tempo. Aguarde alguns minutos e tente novamente.",
  "A conexão pessoal está temporariamente indisponível. Seus registros foram preservados.",
  "Não foi possível consultar os bancos agora. Tente novamente em alguns minutos.",
  "A consulta retornou dados incompletos. Seus registros foram preservados.",
  "A consulta demorou mais que o esperado. Confira a conexão e tente novamente.",
  "Sem conexão com o serviço. Você pode consultar os últimos dados salvos.",
  "Confira a chave de acesso pessoal. Ela é diferente da senha do banco.",
  "A configuração mudou. Tente conectar novamente.",
  "Conecte sua chave de acesso pessoal primeiro.",
  "A conexão foi encerrada.",
  "O histórico da conexão está inválido. Restaure um backup válido.",
  "O histórico de importações está inválido. Restaure um backup válido.",
]);
const safeReviewErrors = new Set([
  "o provedor corrigiu uma operação já importada. Revise manualmente antes de sincronizar novamente.",
  "a operação vinculada à conexão foi alterada ou removida. Revise manualmente antes de importar.",
  "existe um cadastro arquivado. Revise esse ativo antes de importar para evitar duplicar sua carteira.",
  "há mais de um cadastro. Revise os ativos antes de importar.",
  "escolha o mesmo tipo e categoria em todas as operações.",
  "tipo, categoria ou destino diferentes do cadastro atual. Revise a operação; o cadastro existente será preservado.",
  "a venda supera a quantidade disponível na data. Inclua as compras anteriores ou revise as operações.",
]);
function financeErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return;
  if (safeFinanceErrors.has(error.message)) return error.message;
  const review = /^([A-Z0-9_.-]{1,32}): (.+)$/.exec(error.message);
  if (review && safeReviewErrors.has(review[2]!)) return error.message;
}

export default function Banks() {
  const { refresh } = useApp();
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [accessKey, setAccessKey] = useState("");
  const [busy, setBusy] = useState<Busy>("loading");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [autoImport, setAutoImport] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [syncWarnings, setSyncWarnings] = useState<string[]>([]);
  const focused = useRef(false);
  const generation = useRef(0);
  const working = useRef(false);
  const current = (token: number) => focused.current && token === generation.current;

  const sync = useCallback(async (token: number) => {
    const result = await syncFinance();
    if (!current(token)) return;
    setSnapshot(result.snapshot);
    setSyncWarnings(result.warnings);
    setConnected(true);
    setReviewing(false);
    setAcknowledged(false);
    setPreview(null);
    const nextPreview = await previewFinanceImport(result.snapshot);
    if (!current(token)) return;
    setPreview(nextPreview);
    setMessage(result.imported > 0
      ? `Consulta concluída. ${result.imported} operações adicionadas, ${result.duplicates} já registradas e ${nextPreview.pending} pendentes de revisão.`
      : `Consulta concluída. ${nextPreview.newCount} operações para revisar, ${nextPreview.duplicateCount} já registradas e ${nextPreview.pending} pendentes.`);
    if (result.imported > 0) {
      try { await refresh(); }
      catch {
        if (current(token)) setError("As operações foram salvas. Reabra a carteira para atualizar os valores na tela.");
      }
    }
  }, [refresh]);

  const load = useCallback(async (token: number) => {
    try {
      // Keep SQLite reads sequential on the shared Android connection.
      const saved = await loadFinanceSnapshot();
      if (!current(token)) return;
      setSnapshot(saved);
      const hasAccess = await getFinanceAccessStatus();
      if (!current(token)) return;
      setConnected(hasAccess);
      const automatic = await getFinanceAutoImport();
      if (!current(token)) return;
      setAutoImport(automatic);
      setLoaded(true);
      if (saved) {
        const nextPreview = await previewFinanceImport(saved);
        if (!current(token)) return;
        setPreview(nextPreview);
      }
      if (hasAccess && FINANCE_SERVICE_AVAILABLE) {
        setBusy("sync");
        await sync(token);
      }
    } catch (error) {
      if (current(token)) setError(financeErrorMessage(error) ?? "Não foi possível atualizar agora. Os últimos dados salvos continuam disponíveis. Confira sua conexão e tente novamente.");
    } finally {
      if (current(token)) {
        setLoaded(true);
        working.current = false;
        setBusy(null);
      }
    }
  }, [sync]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    const token = ++generation.current;
    working.current = true;
    setBusy("loading");
    setError("");
    setMessage("");
    setPreview(null);
    setReviewing(false);
    setAcknowledged(false);
    setConfirmDisconnect(false);
    void load(token);
    return () => {
      focused.current = false;
      ++generation.current;
      working.current = false;
    };
  }, [load]));

  async function perform(kind: Exclude<Busy, null>, action: (token: number) => Promise<void>) {
    if (working.current || !focused.current) return;
    working.current = true;
    const token = generation.current;
    setBusy(kind);
    setError("");
    setMessage("");
    try { await action(token); }
    catch (error) {
      if (current(token)) setError(financeErrorMessage(error) ?? (kind === "connect"
        ? "Não foi possível conectar. Confira sua chave de acesso pessoal e a conexão com a internet."
        : kind === "import"
          ? "Não foi possível concluir o registro. Tente novamente; as operações já salvas serão reconhecidas para evitar repetição."
          : "Não foi possível concluir agora. Seus últimos dados continuam disponíveis. Tente novamente."));
    } finally {
      if (current(token)) {
        working.current = false;
        setBusy(null);
      }
    }
  }

  function connect() {
    const key = accessKey.trim();
    if (!key || !FINANCE_SERVICE_AVAILABLE) return;
    void perform("connect", async (token) => {
      await saveFinanceAccessKey(key);
      if (!current(token)) return;
      setAccessKey("");
      const hasAccess = await getFinanceAccessStatus();
      if (!current(token)) return;
      setConnected(hasAccess);
      await sync(token);
    });
  }

  function toggleAuto(enabled: boolean) {
    void perform("preference", async (token) => {
      await setFinanceAutoImport(enabled);
      if (!current(token)) return;
      setAutoImport(enabled);
      setMessage(enabled
        ? "Atualização automática ativada para as próximas atualizações. Apenas operações completas e reconhecidas entrarão na carteira."
        : "Atualização automática desativada. Você pode revisar e confirmar cada importação.");
    });
  }

  function confirmImport() {
    if (!snapshot || !preview || !acknowledged || preview.newCount === 0) return;
    const reviewedSnapshot = snapshot;
    void perform("import", async (token) => {
      const result = await commitFinanceImport(reviewedSnapshot);
      if (!current(token)) return;
      setAcknowledged(false);
      setMessage(`${result.imported} operações adicionadas. ${result.duplicates} já registradas foram ignoradas; ${result.pending} continuam pendentes.`);
      const nextPreview = await previewFinanceImport(reviewedSnapshot);
      if (!current(token)) return;
      setPreview(nextPreview);
      try { await refresh(); }
      catch {
        if (current(token)) setError("As operações foram salvas. Reabra a carteira para atualizar os valores na tela.");
      }
    });
  }

  function disconnect() {
    void perform("disconnect", async (token) => {
      await disconnectFinance();
      if (!current(token)) return;
      setConnected(false);
      setSnapshot(null);
      setSyncWarnings([]);
      setPreview(null);
      setAutoImport(false);
      setReviewing(false);
      setAcknowledged(false);
      setConfirmDisconnect(false);
      setAccessKey("");
      setMessage("Acesso removido deste aparelho. Sua carteira e o histórico de operações foram mantidos.");
    });
  }

  const totals = snapshot ? getFinanceTotals(snapshot) : null;
  const hasBankBalance = snapshot?.accounts.some((item) => item.kind === "BANK" && item.currency === "BRL");
  const hasCreditBalance = snapshot?.accounts.some((item) => item.kind === "CREDIT" && item.currency === "BRL");
  const currentInvestments = snapshot?.investments.filter((item) => item.status !== "WITHDRAWN") ?? [];
  const brlInvestments = currentInvestments.filter((item) => item.currency === "BRL");
  const knownInvestmentValues = brlInvestments.filter((item) => item.value !== null).length;
  const partialInvestmentValue = knownInvestmentValues > 0 && knownInvestmentValues < brlInvestments.length;
  const prepared = snapshot ? prepareFinanceTrades(snapshot) : null;
  const warnings = [...new Set([...(snapshot?.warnings ?? []), ...(preview?.warnings ?? []), ...syncWarnings])];
  const disabled = busy !== null;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <ScreenHeader back title="Meus bancos" subtitle="Seus dados, juntos e com clareza" />
          <Card style={styles.hero}>
            <View style={styles.icon}><Ionicons name="business-outline" size={28} color={colors.primary} /></View>
            <Text style={styles.title}>{connected ? "Uma visão das suas contas" : "Acompanhe seus bancos"}</Text>
            <Text style={styles.body}>Consulte os bancos que você já autorizou no MeuPluggy. A consulta não movimenta dinheiro.</Text>
            <Text style={styles.hint}>Os dados acompanham a atualização diária do banco e podem chegar com atraso. Não são valores em tempo real.</Text>
          </Card>

          {busy && <View accessibilityRole="progressbar" accessibilityLabel="Atualizando dados bancários" style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.body}>{busy === "loading" ? "Abrindo seus dados…" : busy === "import" ? "Registrando operações…" : "Aguarde um instante…"}</Text>
          </View>}
          {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
          {!!error && <View style={styles.error}>
            <Text accessibilityRole="alert" style={styles.body}>{error}</Text>
            <Button title="Tentar novamente" variant="secondary" disabled={disabled} onPress={() => {
              if (connected && FINANCE_SERVICE_AVAILABLE) void perform("sync", sync);
              else void perform("loading", load);
            }} />
          </View>}

          {!FINANCE_SERVICE_AVAILABLE && <Card style={styles.card}>
            <Text style={styles.section}>Consulta bancária indisponível</Text>
            <Text style={styles.body}>O serviço de consulta ainda não está disponível nesta versão. Você pode registrar investimentos por comprovante ou extrato.</Text>
            <Button title="Importar comprovante ou extrato" variant="secondary" onPress={() => router.push("/import-investments")} />
          </Card>}

          {loaded && !connected && FINANCE_SERVICE_AVAILABLE && <Card style={styles.card}>
            <Text style={styles.section}>Conectar meu acesso</Text>
            <Text style={styles.body}>Cole a chave de acesso pessoal configurada para sua conexão privada com o MeuPluggy. Ela não é a senha do banco.</Text>
            <Text style={styles.label}>Chave de acesso pessoal</Text>
            <TextInput accessibilityLabel="Chave de acesso pessoal" value={accessKey} onChangeText={setAccessKey}
              secureTextEntry autoComplete={Platform.OS === "web" ? "new-password" : "off"} textContentType="none" importantForAutofill="no"
              autoCorrect={false} autoCapitalize="none" editable={!disabled}
              style={styles.input} returnKeyType="done" onSubmitEditing={connect} />
            <Text style={styles.hint}>A chave é guardada com segurança na versão instalada. Nunca informe sua senha bancária aqui.</Text>
            <Button title={busy === "connect" ? "Conectando…" : "Conectar meus bancos"} disabled={disabled || !accessKey.trim()} onPress={connect} />
          </Card>}

          {connected && FINANCE_SERVICE_AVAILABLE && <Button title={busy === "sync" ? "Atualizando…" : "Atualizar agora"} variant={reviewing && !!preview?.newCount ? "secondary" : "primary"} disabled={disabled} onPress={() => { void perform("sync", sync); }} />}

          {snapshot && totals && <>
            <Text style={styles.updated}>Última consulta: {formatTime(snapshot.syncedAt)}. Sem conexão, estes são os últimos dados salvos.</Text>
            <Card style={styles.card}>
              <Text style={styles.section}>Cada valor no seu lugar</Text>
              <View style={styles.total}><Text style={styles.label}>Saldo em contas · BRL</Text><Text style={styles.value}>{hasBankBalance ? formatMoney(totals.bankBalance) : "Não informado"}</Text></View>
              <View style={styles.total}><Text style={styles.label}>Saldo de cartões · BRL</Text><Text style={styles.value}>{hasCreditBalance ? formatMoney(totals.creditBalance) : "Não informado"}</Text><Text style={styles.hint}>Valor informado pelo banco. Não representa dinheiro disponível para investir.</Text></View>
              <View style={styles.total}>
                <Text style={styles.label}>Investimentos informados · BRL{partialInvestmentValue ? " · Valor parcial" : ""}</Text>
                <Text style={styles.value}>{brlInvestments.length === 0 ? "Nenhum informado" : knownInvestmentValues === 0 ? "Não informado" : formatMoney(totals.investmentsValue)}</Text>
                {partialInvestmentValue && <Text style={styles.hint}>Soma apenas dos investimentos com valor informado. Há posições sem valor nesta consulta; este resumo não representa o total investido.</Text>}
              </View>
              <Text style={styles.hint}>Estes valores são separados e não formam um total de patrimônio. Investimentos podem incluir valores já registrados na carteira ARCA. Saldos e posições não entram automaticamente na carteira nem na reserva.</Text>
              <Text style={styles.hint}>Os resumos acima incluem apenas reais. Valores em outras moedas aparecem nas listas abaixo.</Text>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.section}>Bancos autorizados</Text>
              {snapshot.connections.length === 0 && <Text style={styles.body}>Nenhum banco foi retornado. Confira suas autorizações no MeuPluggy e atualize novamente.</Text>}
              {snapshot.connections.map((connection) => <View key={connection.id} style={styles.row}>
                <Text style={styles.label}>{connection.name}</Text>
                <Text style={styles.status}>{connectionLabels[connection.status]}</Text>
                <Text style={styles.hint}>Atualização no banco: {formatTime(connection.updatedAt)}</Text>
              </View>)}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.section}>Contas e cartões</Text>
              {snapshot.accounts.length === 0 && <Text style={styles.body}>O banco não enviou contas ou cartões nesta consulta. Isso não significa saldo zero.</Text>}
              {snapshot.accounts.map((account) => <View key={account.id} style={styles.row}>
                <Text style={styles.label}>{snapshot.connections.find((item) => item.id === account.connectionId)?.name}</Text>
                <Text style={styles.body}>{account.kind === "BANK" ? "Conta bancária" : "Cartão de crédito"} · {account.currency}</Text>
                <Text style={styles.amount}>{formatMoney(account.balance, account.currency)}</Text>
              </View>)}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.section}>Investimentos no banco</Text>
              <Text style={styles.hint}>Uma consulta das posições informadas pelo banco. Ter um investimento nesta lista não registra uma compra no ARCA.</Text>
              {currentInvestments.length === 0 && <Text style={styles.body}>Nenhum investimento foi informado nesta consulta. A disponibilidade depende do banco e das suas autorizações.</Text>}
              {currentInvestments.map((investment) => <View key={investment.id} style={styles.row}>
                <Text style={styles.label}>{investment.name}</Text>
                <Text style={styles.body}>{investmentLabels[investment.type]} · {investment.currency}</Text>
                <Text style={styles.amount}>{investment.value === null ? "Valor não informado" : formatMoney(investment.value, investment.currency)}</Text>
                <Text style={styles.hint}>{snapshot.connections.find((item) => item.id === investment.connectionId)?.name} · {formatTime(investment.updatedAt)}</Text>
              </View>)}
            </Card>

            <Card style={styles.card}>
              <Text style={styles.section}>Operações na sua carteira</Text>
              <Text style={styles.body}>A conexão com o banco permite consultar dados. Para registrar compras e vendas na carteira ARCA, confira as operações e confirme abaixo.</Text>
              {preview ? <Text style={styles.summary}>{preview.newCount} novas · {preview.duplicateCount} já registradas · {preview.pending} pendentes</Text>
                : <Text style={styles.body}>A revisão das operações ainda não está disponível. Atualize para tentar novamente.</Text>}
              <Button title={reviewing ? "Fechar revisão" : "Revisar operações"} variant="secondary" disabled={disabled || !preview} onPress={() => { setReviewing((value) => !value); setAcknowledged(false); }} />
              {reviewing && preview && <View style={styles.review}>
                <Text style={styles.label}>O que será registrado</Text>
                <Text style={styles.hint}>Confira todas as operações completas abaixo. As {preview.duplicateCount} já registradas serão ignoradas na confirmação.</Text>
                {prepared?.eligible.length === 0 && <Text style={styles.body}>Nenhuma operação completa e reconhecida para registrar nesta consulta.</Text>}
                {prepared?.eligible.map(({ sourceKey, trade }) => <View key={sourceKey} style={styles.row}>
                  <Text style={styles.label}>{trade.type === "BUY" ? "Compra" : "Venda"} · {trade.symbol}</Text>
                  <Text style={styles.body}>{trade.name}</Text>
                  <Text style={styles.body}>{formatTradeDate(trade.tradeDate)} · {trade.broker}</Text>
                  <Text style={styles.body}>Quantidade: {trade.quantity}</Text>
                  <Text style={styles.body}>Preço por unidade: {formatMoney(trade.unitPrice)}</Text>
                  <Text style={styles.body}>Taxas: {formatMoney(trade.fees)}</Text>
                </View>)}
                <Text style={styles.hint}>Saldos, reserva e posições do banco não serão adicionados como compras. Operações pendentes precisam de comprovante ou registro manual. Correções do banco também precisam de revisão manual.</Text>
                {preview.newCount > 0 && <>
                  <View style={styles.switchRow}>
                    <Text style={[styles.body, styles.fill]}>Conferi as datas, valores, compras e vendas. Autorizo registrar as novas operações na carteira ARCA.</Text>
                    <Switch accessibilityLabel="Conferi e autorizo registrar as novas operações" value={acknowledged} disabled={disabled} onValueChange={setAcknowledged} trackColor={{ true: colors.primary }} />
                  </View>
                  <Button title={`Confirmar ${preview.newCount} operações`} disabled={disabled || !acknowledged} onPress={confirmImport} />
                </>}
              </View>}
              {preview?.pending ? <View style={styles.review}>
                <Text style={styles.hint}>{preview.pending} operações não serão adicionadas porque faltam dados confirmados. Use um comprovante ou registre a operação manualmente.</Text>
                <Button title="Importar comprovante ou extrato" variant="secondary" disabled={disabled} onPress={() => router.push("/import-investments")} />
                <View style={styles.gap} />
                <Button title="Registrar uma operação" variant="secondary" disabled={disabled} onPress={() => router.push("/contribution")} />
              </View> : null}
            </Card>

            {connected && <Card style={styles.card}>
              <Text style={styles.section}>Próximas atualizações</Text>
              <Text style={styles.body}>Se você ativar, as próximas consultas poderão registrar operações completas e reconhecidas na carteira, sem uma nova confirmação. Operações repetidas serão ignoradas; pendências e correções continuam manuais.</Text>
              <Text style={styles.hint}>Ativar não importa as operações desta consulta. Saldos e posições continuam apenas para consulta.</Text>
              <View style={styles.switchRow}>
                <Text style={[styles.label, styles.fill]}>Atualizar carteira automaticamente</Text>
                <Switch accessibilityLabel="Atualizar carteira automaticamente nas próximas consultas" value={autoImport} disabled={disabled || !FINANCE_SERVICE_AVAILABLE} onValueChange={toggleAuto} trackColor={{ true: colors.primary }} />
              </View>
            </Card>}

            {warnings.length > 0 && <Card style={styles.card}>
              <Text style={styles.section}>Pontos para conferir</Text>
              {warnings.map((warning, index) => <Text key={index} style={styles.body}>• {warning}</Text>)}
            </Card>}
          </>}

          {(connected || snapshot) && <Card style={styles.card}>
            <Text style={styles.section}>Seu acesso neste aparelho</Text>
            <Text style={styles.hint}>Desconectar remove a chave, os dados bancários salvos e a atualização automática deste aparelho. Sua carteira e seu histórico permanecem. Para revogar a autorização bancária, use o MeuPluggy ou seu banco.</Text>
            {confirmDisconnect ? <>
              <Text style={styles.body}>Remover o acesso deste aparelho?</Text>
              <Button title="Confirmar desconexão" variant="danger" disabled={disabled} onPress={disconnect} />
              <View style={styles.gap} />
              <Button title="Manter conectado" variant="secondary" disabled={disabled} onPress={() => setConfirmDisconnect(false)} />
            </> : <Button title="Desconectar deste aparelho" variant="secondary" disabled={disabled} onPress={() => setConfirmDisconnect(true)} />}
          </Card>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: { padding: 20, paddingBottom: 60, width: "100%", maxWidth: layout.maxWidth + 40, alignSelf: "center" },
  hero: { marginBottom: 18, backgroundColor: "#EDF5EF" },
  icon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { color: colors.ink, fontSize: 24, fontWeight: "800", marginBottom: 10 },
  section: { color: colors.ink, fontSize: 18, fontWeight: "800", marginBottom: 12 },
  card: { marginTop: 16 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 22, marginBottom: 10 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  label: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: "700", marginBottom: 6 },
  value: { color: colors.primary, fontSize: 27, fontWeight: "800", marginBottom: 6 },
  amount: { color: colors.ink, fontSize: 20, fontWeight: "700", marginBottom: 8 },
  total: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 10 },
  row: { paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 6, paddingBottom: 8 },
  status: { color: colors.primary, fontSize: 14, lineHeight: 22, marginBottom: 6 },
  input: { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.ink, minHeight: 52, padding: 14, fontSize: 16, marginBottom: 12 },
  updated: { color: colors.muted, fontSize: 12, lineHeight: 19, marginTop: 14 },
  loading: { flexDirection: "row", gap: 12, alignItems: "center", paddingVertical: 12 },
  notice: { backgroundColor: colors.successSoft, color: colors.primary, borderRadius: 16, padding: 16, fontSize: 14, lineHeight: 22, marginVertical: 10 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: 16, padding: 16, marginVertical: 10 },
  summary: { fontWeight: "700", color: colors.primary, lineHeight: 22, marginBottom: 16 },
  review: { marginTop: 18 },
  switchRow: { flexDirection: "row", gap: 12, alignItems: "center", marginVertical: 12 },
  gap: { height: 10 },
});
