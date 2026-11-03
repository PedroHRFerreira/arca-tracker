import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import {
  getAssetCatalogMetadata,
  ReviewedImportTradeSchema,
  type ReviewedImportTrade,
} from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { ImportTradeEditor, displayDate } from "@/components/ImportTradeEditor";
import { ImportInstructions } from "@/components/ImportInstructions";
import { ImportFeedback } from "@/components/ImportFeedback";
import { commitInvestmentImport, previewInvestmentImport } from "@/db/database";
import {
  IMPORT_LIMITS,
  parseImportDate,
  parseImportDocument,
  readImportDocument,
  type ImportDraftRow,
} from "@/imports";
import { PressFeedback, useContentTransition } from "@/motion/Motion";
import { useApp } from "@/providers/AppProvider";
import { colors, money } from "@/theme";

type Stage = "SELECT" | "REVIEW" | "PREVIEW" | "SUCCESS";
type Preview = Awaited<ReturnType<typeof previewInvestmentImport>>;
const pageSize = 5;

export default function ImportInvestments() {
  const { assets, refresh } = useApp();
  const [stage, setStage] = useState<Stage>("SELECT");
  const [rows, setRows] = useState<ImportDraftRow[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState<"READ" | "PREVIEW" | "SAVE" | null>(null);
  const [page, setPage] = useState(0);
  const [reviewed, setReviewed] = useState<ReviewedImportTrade[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
  } | null>(null);
  const [refreshWarning, setRefreshWarning] = useState("");
  const inFlight = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const { transition, transitioning, motionStyle } = useContentTransition();
  const disabled = !!busy || transitioning;
  const selectedCount = rows.filter((row) => !excluded.has(row.key)).length;
  const pages = Math.ceil(rows.length / pageSize);
  const steps = ["Documento", "Conferência", "Confirmação"];
  const step = stage === "SELECT" ? 0 : stage === "REVIEW" ? 1 : 2;

  const go = async (next: Stage, direction = 1) => {
    await transition(() => {
      setStage(next);
      scroll.current?.scrollTo({ y: 0, animated: false });
    }, direction);
  };

  function enrich(row: ImportDraftRow): ImportDraftRow {
    const known = assets.find(
      (asset) => asset.symbol.toUpperCase() === row.symbol.toUpperCase(),
    );
    const catalog = getAssetCatalogMetadata(row.symbol);
    const type = known?.assetType;
    return {
      ...row,
      name: row.name || known?.name || catalog?.name || "",
      arcaClass: known?.arcaClass ?? catalog?.arcaClass ?? row.arcaClass,
      assetType:
        type === "EQUITY" || type === "ETF" || type === "FII"
          ? type
          : row.assetType,
    };
  }

  async function chooseFile() {
    if (inFlight.current) return;
    inFlight.current = true;
    setError("");
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "text/csv",
          "text/comma-separated-values",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset)
        throw new Error("Nenhum arquivo foi selecionado. Tente novamente.");
      if (asset.size !== undefined && asset.size > IMPORT_LIMITS.bytes)
        throw new Error(
          "O arquivo ultrapassa 10 MB. Escolha um arquivo menor.",
        );
      setBusy("READ");
      const document = await readImportDocument(asset);
      const parsed = parseImportDocument(document);
      setFileName(document.fileName);
      setWarnings(parsed.warnings);
      setRows(parsed.rows.map(enrich));
      setExcluded(new Set());
      setRowErrors({});
      setChecked(false);
      setPage(0);
      setPreview(null);
      setReviewed([]);
      setResult(null);
      setRefreshWarning("");
      if (parsed.rows.length) await go("REVIEW");
      else {
        setError(
          "Não reconhecemos operações suficientes para cadastrar este documento. Você pode escolher outro arquivo ou registrar a compra manualmente.",
        );
        await go("SELECT", -1);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir o documento. Escolha outro arquivo ou registre a operação manualmente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function changeRow(next: ImportDraftRow) {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== next.key) return row;
        if (
          row.symbol.trim().toUpperCase() !== next.symbol.trim().toUpperCase()
        ) {
          const symbol = next.symbol.trim().toUpperCase();
          const known = assets.find(
            (asset) => asset.symbol.toUpperCase() === symbol,
          );
          const catalog = getAssetCatalogMetadata(symbol);
          return enrich({
            ...next,
            symbol,
            name: known?.name || catalog?.name || "",
            arcaClass: catalog?.arcaClass ?? null,
            assetType:
              catalog?.assetType === "TREASURY"
                ? null
                : (catalog?.assetType ?? null),
          });
        }
        return next;
      }),
    );
    setChecked(false);
    setError("");
    setRowErrors((current) => {
      const nextErrors = { ...current };
      delete nextErrors[next.key];
      return nextErrors;
    });
  }

  function toggleIncluded(key: string) {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setChecked(false);
    setError("");
  }

  async function checkPreview() {
    if (inFlight.current) return;
    setError("");
    const selected = rows.filter((row) => !excluded.has(row.key));
    if (!selected.length) {
      setError("Inclua pelo menos uma operação para continuar.");
      return;
    }
    const errors: Record<string, string> = {};
    const valid: ReviewedImportTrade[] = [];
    for (const row of selected) {
      if (!row.feesConfirmed) {
        errors[row.key] =
          "Confira os custos desta operação. Informe o valor ou confirme que não houve custos.";
        continue;
      }
      const parsed = ReviewedImportTradeSchema.safeParse({
        ...row,
        tradeDate: parseImportDate(row.tradeDate),
        quantity: decimalValue(row.quantity),
        unitPrice: decimalValue(row.unitPrice),
        fees: decimalValue(row.fees),
        bucket: "LONG_TERM",
      });
      if (!parsed.success) {
        const labels: Record<string, string> = {
          symbol: "código",
          name: "nome",
          arcaClass: "grupo na carteira",
          assetType: "tipo de investimento",
          tradeDate: "data",
          type: "compra ou venda",
          quantity: "quantidade",
          unitPrice: "preço",
          fees: "custos",
          broker: "instituição",
        };
        const fields = [
          ...new Set(
            parsed.error.issues.map(
              (issue) => labels[String(issue.path[0])] ?? "dados",
            ),
          ),
        ];
        const explanation = parsed.error.issues.find(
          (issue) =>
            issue.code === "custom" &&
            (issue.path[0] === "tradeDate" || issue.path[0] === "arcaClass"),
        )?.message;
        errors[row.key] =
          `Revise ${fields.join(", ")} desta operação. ${explanation ?? "Preencha os campos obrigatórios com os valores do documento."}`;
      } else valid.push(parsed.data);
    }
    setRowErrors(errors);
    if (Object.keys(errors).length) {
      const first = rows.findIndex((row) => errors[row.key]);
      setPage(Math.floor(first / pageSize));
      setError(
        "Há dados para conferir nas operações indicadas. Nenhuma alteração foi salva.",
      );
      scroll.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    if (!checked) {
      setError(
        "Confirme que você conferiu as operações realizadas antes de continuar.",
      );
      return;
    }
    inFlight.current = true;
    setBusy("PREVIEW");
    try {
      const nextPreview = await previewInvestmentImport(valid);
      setReviewed(valid);
      setPreview(nextPreview);
      await go("PREVIEW");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível conferir sua carteira. Seus dados continuam aqui para revisar e tentar novamente.",
      );
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  async function confirmImport() {
    if (inFlight.current || !preview || !reviewed.length || result) return;
    inFlight.current = true;
    setBusy("SAVE");
    setError("");
    try {
      const saved = await commitInvestmentImport(reviewed);
      setResult(saved);
      try {
        await refresh();
      } catch {
        setRefreshWarning(
          "As operações foram salvas. Ao abrir a carteira, atualize a tela para carregar os valores novamente.",
        );
      }
      await go("SUCCESS");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar. Seus dados de conferência foram mantidos; tente novamente.",
      );
    } finally {
      setBusy(null);
      inFlight.current = false;
    }
  }

  const changePage = (next: number) => {
    setPage(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            back
            title="Importar investimentos"
            subtitle="Do comprovante para a sua carteira"
          />
          {stage !== "SUCCESS" && (
            <View
              style={styles.progress}
              accessibilityLabel={`Etapa ${step + 1} de 3: ${steps[step]}`}
            >
              {steps.map((label, index) => (
                <View key={label} style={styles.progressItem}>
                  <View
                    style={[
                      styles.progressLine,
                      index <= step && { backgroundColor: colors.primary },
                    ]}
                  />
                  <Text
                    style={[
                      styles.progressText,
                      index === step && {
                        color: colors.primary,
                        fontWeight: "800",
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {busy === "READ" && (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="Lendo documento"
              style={styles.loading}
            >
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.text}>Lendo o arquivo no seu aparelho…</Text>
            </View>
          )}
          <Animated.View style={motionStyle}>
            {stage === "SELECT" && (
              <>
                <Card style={styles.hero}>
                  <View style={styles.icon}>
                    <Ionicons
                      name="document-text-outline"
                      size={32}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={styles.heading}>
                    Você compra. O ARCA organiza.
                  </Text>
                  <Text style={styles.text}>
                    Depois de negociar no banco ou na corretora, escolha o
                    comprovante ou extrato de investimentos. Você confere os
                    dados antes de adicionar à carteira.
                  </Text>
                  <Button
                    title={
                      busy === "READ"
                        ? "Lendo documento…"
                        : "Escolher documento"
                    }
                    disabled={disabled}
                    onPress={chooseFile}
                  />
                  <Text style={styles.small}>
                    PDF com texto, CSV ou Excel · até 10 MB
                  </Text>
                </Card>
                {!!fileName && (
                  <Text style={styles.fileName}>
                    Último arquivo: {fileName}
                  </Text>
                )}
                <ImportFeedback error={error} warnings={warnings} />
                <ImportInstructions />
                <View style={{ height: 14 }} />
                <Button
                  title="Registrar manualmente"
                  variant="secondary"
                  disabled={disabled}
                  onPress={() => router.push("/contribution")}
                />
              </>
            )}
            {stage === "REVIEW" && (
              <>
                <Text style={styles.heading}>Confira o que foi lido</Text>
                <Text style={styles.text}>
                  {rows.length}{" "}
                  {rows.length === 1
                    ? "operação encontrada"
                    : "operações encontradas"}{" "}
                  · {selectedCount}{" "}
                  {selectedCount === 1 ? "selecionada" : "selecionadas"}
                </Text>
                <Text style={styles.fileName} numberOfLines={2}>
                  {fileName}
                </Text>
                <Text style={styles.small}>
                  Nada foi salvo ainda. Corrija os campos com o documento
                  original e desmarque o que não quiser importar.
                </Text>
                <ImportFeedback error={error} warnings={warnings} />
                {pages > 1 && (
                  <Text style={styles.pageLabel}>
                    Operações {page * pageSize + 1} a{" "}
                    {Math.min((page + 1) * pageSize, rows.length)} de{" "}
                    {rows.length}
                  </Text>
                )}
                {rows
                  .slice(page * pageSize, (page + 1) * pageSize)
                  .map((row, index) => (
                    <ImportTradeEditor
                      key={row.key}
                      row={row}
                      index={page * pageSize + index}
                      included={!excluded.has(row.key)}
                      disabled={disabled}
                      error={rowErrors[row.key]}
                      onChange={changeRow}
                      onToggleIncluded={() => toggleIncluded(row.key)}
                    />
                  ))}
                {pages > 1 && (
                  <View style={styles.pagination}>
                    <PressFeedback
                      accessibilityRole="button"
                      accessibilityLabel="Operações anteriores"
                      disabled={disabled || page === 0}
                      onPress={() => changePage(page - 1)}
                      style={[
                        styles.pageButton,
                        page === 0 && { opacity: 0.35 },
                      ]}
                    >
                      <Ionicons
                        name="chevron-back"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={styles.pageButtonText}>Anteriores</Text>
                    </PressFeedback>
                    <Text style={styles.small}>
                      {page + 1} / {pages}
                    </Text>
                    <PressFeedback
                      accessibilityRole="button"
                      accessibilityLabel="Próximas operações"
                      disabled={disabled || page === pages - 1}
                      onPress={() => changePage(page + 1)}
                      style={[
                        styles.pageButton,
                        page === pages - 1 && { opacity: 0.35 },
                      ]}
                    >
                      <Text style={styles.pageButtonText}>Próximas</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={20}
                        color={colors.primary}
                      />
                    </PressFeedback>
                  </View>
                )}
                <PressFeedback
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked, disabled }}
                  accessibilityLabel="Conferi os dados de todas as operações selecionadas e são negociações que realizei"
                  disabled={disabled}
                  onPress={() => {
                    setChecked(!checked);
                    setError("");
                  }}
                  style={styles.confirmCheck}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={26}
                    color={colors.primary}
                  />
                  <Text style={styles.confirmCheckText}>
                    Conferi os dados de todas as operações selecionadas e são
                    negociações que realizei.
                  </Text>
                </PressFeedback>
                <Button
                  title={
                    busy === "PREVIEW"
                      ? "Conferindo carteira…"
                      : "Ver resumo antes de salvar"
                  }
                  disabled={disabled || !selectedCount}
                  onPress={checkPreview}
                />
                <View style={{ height: 10 }} />
                <Button
                  title="Escolher outro documento"
                  variant="secondary"
                  disabled={disabled}
                  onPress={chooseFile}
                />
                {!!error && (
                  <>
                    <View style={{ height: 10 }} />
                    <Button
                      title="Registrar manualmente"
                      variant="secondary"
                      disabled={disabled}
                      onPress={() => router.push("/contribution")}
                    />
                  </>
                )}
              </>
            )}
            {stage === "PREVIEW" && preview && (
              <>
                <Text style={styles.heading}>Tudo pronto para adicionar?</Text>
                <Text style={styles.text}>
                  Confira o resultado. A carteira só muda depois da sua
                  confirmação abaixo.
                </Text>
                <Card style={styles.summary}>
                  <View style={styles.summaryLine}>
                    <Text style={styles.text}>Novas operações</Text>
                    <Text style={styles.count}>{preview.newCount}</Text>
                  </View>
                  <View style={styles.summaryLine}>
                    <Text style={styles.text}>
                      Já registradas · serão ignoradas
                    </Text>
                    <Text style={styles.count}>{preview.duplicateCount}</Text>
                  </View>
                  <View style={styles.divider} />
                  <Text style={styles.summaryTitle}>
                    Destino: carteira do seu objetivo
                  </Text>
                  <Text style={styles.small}>
                    Os ativos serão cadastrados nos grupos que você conferiu. A
                    reserva de emergência fica separada.
                  </Text>
                </Card>
                <ImportFeedback error={error} warnings={preview.warnings} />
                <Card style={{ marginBottom: 18 }}>
                  <Text style={styles.summaryTitle}>Operações conferidas</Text>
                  {reviewed.slice(0, 10).map((trade, index) => (
                    <View key={index} style={styles.tradeSummary}>
                      <Text style={styles.tradeTitle}>
                        {trade.type === "BUY" ? "Compra" : "Venda"} ·{" "}
                        {trade.symbol}
                      </Text>
                      <Text style={styles.small}>
                        {displayDate(trade.tradeDate)} ·{" "}
                        {trade.quantity.replace(".", ",")} un. ×{" "}
                        {preciseMoney(trade.unitPrice)}
                      </Text>
                      <Text style={styles.small}>
                        Custos: {preciseMoney(trade.fees)}
                        {trade.broker ? ` · ${trade.broker}` : ""}
                      </Text>
                    </View>
                  ))}
                  {reviewed.length > 10 && (
                    <Text style={styles.small}>
                      E mais {reviewed.length - 10} operações conferidas. Use
                      “Voltar à conferência” para consultar todas.
                    </Text>
                  )}
                </Card>
                <Button
                  title={
                    busy === "SAVE"
                      ? "Salvando na carteira…"
                      : preview.newCount
                        ? "Confirmar e adicionar à carteira"
                        : "Concluir sem adicionar duplicatas"
                  }
                  disabled={disabled}
                  onPress={confirmImport}
                />
                <View style={{ height: 10 }} />
                <Button
                  title="Voltar à conferência"
                  variant="secondary"
                  disabled={disabled}
                  onPress={() => {
                    setError("");
                    void go("REVIEW", -1);
                  }}
                />
              </>
            )}
            {stage === "SUCCESS" && result && (
              <Card style={styles.hero}>
                <View
                  style={[styles.icon, { backgroundColor: colors.successSoft }]}
                >
                  <Ionicons name="checkmark" size={36} color={colors.primary} />
                </View>
                <Text accessibilityRole="header" style={styles.heading}>
                  {result.imported
                    ? "Sua carteira foi atualizada"
                    : "Sua carteira já estava em dia"}
                </Text>
                <Text style={styles.text}>
                  {result.imported}{" "}
                  {result.imported === 1
                    ? "operação adicionada"
                    : "operações adicionadas"}
                  {result.duplicates
                    ? ` e ${result.duplicates} ${result.duplicates === 1 ? "duplicata ignorada" : "duplicatas ignoradas"}`
                    : ""}
                  .
                </Text>
                <Text style={styles.small}>
                  {result.imported
                    ? "O preço da negociação foi registrado como referência histórica. "
                    : "Seus registros existentes foram preservados. "}
                  Use a atualização da carteira para consultar uma cotação mais
                  recente, quando disponível.
                </Text>
                <ImportFeedback
                  warnings={refreshWarning ? [refreshWarning] : []}
                />
                <Button
                  title="Ver minha carteira"
                  disabled={disabled}
                  onPress={() => router.replace("/(tabs)/assets")}
                />
                <View style={{ height: 10 }} />
                <Button
                  title="Importar outro documento"
                  variant="secondary"
                  disabled={disabled}
                  onPress={chooseFile}
                />
                {!!error && (
                  <>
                    <ImportFeedback error={error} />
                    <Button
                      title="Registrar manualmente"
                      variant="secondary"
                      disabled={disabled}
                      onPress={() => router.push("/contribution")}
                    />
                  </>
                )}
              </Card>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Canonical values and editable Brazilian decimals; never round imported precision. */
function decimalValue(value: string): string {
  const input = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (input.includes(","))
    return /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,12}$/.test(input)
      ? input.replace(/\./g, "").replace(",", ".")
      : "";
  return /^\d+(?:\.\d{1,12})?$/.test(input) ? input : "";
}

function preciseMoney(value: string): string {
  return /\.\d{3,}$/.test(value)
    ? `R$ ${value.replace(".", ",")}`
    : money(value);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  progress: { flexDirection: "row", gap: 10, marginBottom: 24 },
  progressItem: { flex: 1 },
  progressLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 7,
  },
  progressText: { color: colors.muted, fontSize: 11 },
  hero: { gap: 16, marginBottom: 18 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: "#EAF1EC",
    alignItems: "center",
    justifyContent: "center",
  },
  heading: {
    color: colors.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginBottom: 5,
  },
  text: { color: colors.muted, fontSize: 14, lineHeight: 23, flexShrink: 1 },
  small: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 5,
  },
  fileName: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 5,
    marginBottom: 10,
  },
  loading: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#EAF1EC",
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 18,
  },
  pageLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 12,
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 15,
  },
  pageButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pageButtonText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  confirmCheck: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 15,
    marginBottom: 14,
  },
  confirmCheckText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  summary: { marginTop: 20, marginBottom: 18, gap: 14 },
  summaryLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
  },
  count: { color: colors.primary, fontSize: 25, fontWeight: "800" },
  divider: { height: 1, backgroundColor: colors.border },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
  },
  tradeSummary: {
    paddingTop: 14,
    marginTop: 12,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  tradeTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
});
