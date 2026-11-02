import { PressFeedback as Pressable } from "@/motion/Motion";
import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Decimal from "decimal.js";
import {
  ARCA_LABELS,
  ARCA_SHORT_LABELS,
  allocateContribution,
  localDateString,
  parseMoneyInput,
  type ArcaClass,
  type AssetBucket,
} from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { MoneyInput } from "@/components/MoneyInput";
import { recordAssetMovement } from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { colors, money } from "@/theme";

const classes: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];
function parseQuantity(input: string): string {
  const value = input.trim();
  const normalized = value.includes(",")
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,12}$/.test(value)
      ? value.replace(/\./g, "").replace(",", ".")
      : ""
    : /^\d{1,3}(?:\.\d{3})+$/.test(value)
      ? value.replace(/\./g, "")
      : value;
  if (
    !/^\d+(?:\.\d{1,12})?$/.test(normalized) ||
    !new Decimal(normalized).gt(0)
  )
    throw new Error("Informe uma quantidade maior que zero.");
  return new Decimal(normalized).toFixed();
}
export default function Contribution() {
  const params = useLocalSearchParams<{
    assetId?: string;
    symbol?: string;
    name?: string;
    arcaClass?: ArcaClass;
    bucket?: AssetBucket;
  }>();
  const { assets, activePlan, strategyPortfolio, reserveValue, refresh } =
    useApp();
  const initialAsset = assets.find((asset) => asset.id === params.assetId);
  const [assetId, setAssetId] = useState(initialAsset?.id ?? "");
  const [symbol, setSymbol] = useState(params.symbol ?? "");
  const [name, setName] = useState(params.name ?? "");
  const [bucket, setBucket] = useState<AssetBucket>(
    initialAsset?.bucket ??
      (params.bucket === "RESERVE" ? "RESERVE" : "LONG_TERM"),
  );
  const [arcaClass, setClass] = useState<ArcaClass>(
    initialAsset?.arcaClass ??
      (params.bucket === "RESERVE"
        ? "CASH_FIXED_INCOME"
        : classes.includes(params.arcaClass as ArcaClass)
          ? params.arcaClass!
          : "BRAZIL_STOCKS"),
  );
  const [type, setType] = useState<"BUY" | "SELL" | "BALANCE">(
    initialAsset?.assetType === "BALANCE" || params.bucket === "RESERVE"
      ? "BALANCE"
      : "BUY",
  );
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedAsset = assets.find((asset) => asset.id === assetId);
  const total = useMemo(() => {
    try {
      return new Decimal(parseQuantity(quantity))
        .mul(parseMoneyInput(price))
        .toFixed(2);
    } catch {
      return "0.00";
    }
  }, [quantity, price]);
  const allocation = activePlan
    ? allocateContribution({
        profile: activePlan,
        portfolio: strategyPortfolio,
        reserveValue,
      })
    : null;
  const changedBucket = !!selectedAsset && selectedAsset.bucket !== bucket;

  async function save() {
    setError("");
    let normalizedQuantity = "";
    let normalizedPrice = "";
    let normalizedBalance = "";
    try {
      if (!assetId && !name.trim())
        throw new Error("Dê um nome ao investimento para encontrá-lo depois.");
      if (!assetId && type !== "BALANCE" && !symbol.trim())
        throw new Error(
          "Informe o código do ativo ou escolha Atualizar saldo.",
        );
      if (!assetId && type === "SELL")
        throw new Error(
          "Escolha um investimento já registrado para informar uma venda.",
        );
      if (bucket === "RESERVE" && arcaClass !== "CASH_FIXED_INCOME")
        throw new Error(
          "A reserva deve usar um investimento de caixa ou renda fixa.",
        );
      if (type === "BALANCE") {
        try {
          normalizedBalance = parseMoneyInput(balance);
        } catch {
          throw new Error(
            "Informe um saldo válido, igual ou maior que zero. Exemplo: 1.250,50.",
          );
        }
      } else {
        normalizedQuantity = parseQuantity(quantity);
        try {
          normalizedPrice = parseMoneyInput(price);
        } catch {
          throw new Error("Informe um preço válido. Exemplo: 25,90.");
        }
        if (!new Decimal(normalizedPrice).gt(0))
          throw new Error("O preço precisa ser maior que zero.");
      }
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : "Revise os campos.",
      );
      return;
    }
    try {
      setSaving(true);
      await recordAssetMovement({
        assetId: assetId || undefined,
        asset: assetId
          ? undefined
          : {
              symbol: symbol.trim() || `SALDO-${Date.now()}`,
              name: name.trim(),
              arcaClass,
              assetType: type === "BALANCE" ? "BALANCE" : "MARKET",
              quoteMode: type === "BALANCE" ? "MANUAL" : "API",
              bucket,
            },
        bucket,
        movement: {
          type,
          date: localDateString(),
          quantity: normalizedQuantity || undefined,
          unitPrice: normalizedPrice || undefined,
          balance: normalizedBalance || undefined,
        },
      });
      try {
        await refresh();
      } catch {
        Alert.alert(
          "Movimentação salva",
          "Seu registro foi salvo. Atualize a carteira novamente para ver os valores mais recentes.",
        );
      }
      router.back();
    } catch (saveError) {
      const message =
        saveError instanceof Error &&
        saveError.message === "INSUFFICIENT_POSITION"
          ? "A venda é maior que a quantidade disponível. Revise sua posição."
          : "Não foi possível salvar a movimentação. Revise os valores e tente novamente.";
      setError(message);
      Alert.alert("Não foi possível salvar", message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader
            back
            title="Registrar investimento"
            subtitle="Atualize o que você realizou na sua instituição"
          />
          <Card style={{ marginBottom: 20 }}>
            <Text style={styles.text}>
              Este registro acompanha compras, vendas e saldos. Ele não
              movimenta dinheiro nem executa investimentos.
            </Text>
          </Card>
          <Text style={styles.label}>Qual investimento?</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 20 }}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setAssetId("");
                setError("");
                if (type === "SELL") setType("BUY");
              }}
              style={[styles.chip, !assetId && styles.activeChip]}
            >
              <Text style={[styles.chipText, !assetId && styles.activeText]}>
                + Novo investimento
              </Text>
            </Pressable>
            {assets.map((asset) => (
              <Pressable
                accessibilityRole="button"
                key={asset.id}
                onPress={() => {
                  setAssetId(asset.id);
                  setClass(asset.arcaClass);
                  setBucket(asset.bucket);
                  setType(asset.assetType === "BALANCE" ? "BALANCE" : "BUY");
                  setError("");
                }}
                style={[styles.chip, assetId === asset.id && styles.activeChip]}
              >
                <Text
                  style={[
                    styles.chipText,
                    assetId === asset.id && styles.activeText,
                  ]}
                >
                  {asset.symbol}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          {!assetId && (
            <>
              <Field
                label="Nome do investimento"
                value={name}
                onChangeText={setName}
                placeholder="Ex.: minha reserva no banco"
              />
              <Field
                label="Código do ativo (opcional para saldo)"
                value={symbol}
                onChangeText={setSymbol}
                autoCapitalize="characters"
                placeholder="Ex.: BOVA11"
              />
            </>
          )}
          <Text style={styles.label}>Para que serve este dinheiro?</Text>
          <View style={styles.wrap}>
            {(
              [
                ["LONG_TERM", "Meu objetivo"],
                ["RESERVE", "Reserva de emergência"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                accessibilityRole="button"
                key={value}
                disabled={
                  value === "RESERVE" &&
                  !!selectedAsset &&
                  arcaClass !== "CASH_FIXED_INCOME"
                }
                onPress={() => {
                  setBucket(value);
                  if (value === "RESERVE" && !assetId)
                    setClass("CASH_FIXED_INCOME");
                }}
                style={[
                  styles.choice,
                  bucket === value && styles.activeChip,
                  value === "RESERVE" &&
                    !!selectedAsset &&
                    arcaClass !== "CASH_FIXED_INCOME" && { opacity: 0.4 },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    bucket === value && styles.activeText,
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.help}>
            {changedBucket
              ? "Ao salvar, TODO o saldo deste ativo passará para o destino escolhido. Ele não será contado duas vezes."
              : "A reserva fica separada da distribuição de longo prazo. Use caixa ou renda fixa com baixo risco e facilidade de resgate."}
          </Text>
          {!assetId && (
            <>
              <Text style={styles.label}>Grupo do investimento</Text>
              <View style={styles.wrap}>
                {(bucket === "RESERVE"
                  ? (["CASH_FIXED_INCOME"] as ArcaClass[])
                  : classes
                ).map((item) => (
                  <Pressable
                    accessibilityRole="button"
                    key={item}
                    onPress={() => setClass(item)}
                    style={[
                      styles.choice,
                      arcaClass === item && styles.activeChip,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        arcaClass === item && styles.activeText,
                      ]}
                    >
                      {ARCA_SHORT_LABELS[item]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          <Text style={styles.label}>O que você realizou?</Text>
          <View style={styles.wrap}>
            {(
              [
                ["BUY", "Compra"],
                ["SELL", "Venda"],
                ["BALANCE", "Atualizar saldo"],
              ] as const
            )
              .filter(
                ([value]) =>
                  !selectedAsset ||
                  (selectedAsset.assetType === "BALANCE"
                    ? value === "BALANCE"
                    : value !== "BALANCE"),
              )
              .map(([value, label]) => (
                <Pressable
                  accessibilityRole="button"
                  key={value}
                  onPress={() => setType(value)}
                  style={[styles.choice, type === value && styles.activeChip]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      type === value && styles.activeText,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
          </View>
          {type === "BALANCE" ? (
            <>
              <Text style={styles.help}>
                Informe o valor total atual deste investimento, não apenas o
                novo aporte.
              </Text>
              <Field
                label="Saldo total atual (R$)"
                value={balance}
                onChangeText={setBalance}
                keyboardType="decimal-pad"
                placeholder="0,00"
              />
            </>
          ) : (
            <>
              <Field
                label="Quantidade de cotas ou unidades"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                placeholder="Ex.: 10 ou 0,5"
              />
              <Field
                label="Preço por unidade (R$)"
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholder="0,00"
              />
              <Card style={{ marginBottom: 20 }}>
                <Text style={styles.text}>Valor desta movimentação</Text>
                <Text style={styles.total}>{money(total)}</Text>
              </Card>
            </>
          )}
          {allocation && type !== "SELL" && (
            <Card style={{ marginBottom: 20 }}>
              <Text style={styles.label}>
                Referência para seu próximo aporte
              </Text>
              <Text style={styles.text}>
                {money(allocation.total)} planejados, considerando sua carteira
                registrada hoje.
              </Text>
              {Number(allocation.debt) > 0 && (
                <Text style={styles.text}>
                  {money(allocation.debt)} para organizar as dívidas caras;
                  confirme a resolução em Meu plano.
                </Text>
              )}
              {Number(allocation.reserve) > 0 && (
                <Text style={styles.text}>
                  Reserva: {money(allocation.reserve)}
                </Text>
              )}
              {classes
                .filter((key) => Number(allocation.investments[key]) > 0)
                .map((key) => (
                  <Text key={key} style={styles.text}>
                    {ARCA_LABELS[key]}: {money(allocation.investments[key])}
                  </Text>
                ))}
              <Text style={styles.help}>
                Esta referência não preenche nem cria investimentos. Registre
                acima somente o que você realizou.
              </Text>
            </Card>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Button
            title={saving ? "Salvando…" : "Salvar movimentação realizada"}
            disabled={saving}
            onPress={save}
          />
          <View style={{ height: 10 }} />
          <Button
            title="Voltar"
            variant="secondary"
            disabled={saving}
            onPress={() => router.back()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
function Field({ label, ...props }: TextInputProps & { label: string }) {
  const Input = label.endsWith("(R$)") ? MoneyInput : TextInput;
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.label}>{label}</Text>
      <Input
        style={styles.input}
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  label: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 9,
  },
  text: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  help: { color: colors.muted, fontSize: 13, lineHeight: 20, marginBottom: 18 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 54,
    fontSize: 17,
    color: colors.ink,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: "#EAF0E6",
    borderRadius: 14,
    marginRight: 8,
  },
  activeChip: { backgroundColor: colors.primary },
  chipText: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  activeText: { color: "#FFF" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  choice: {
    paddingHorizontal: 13,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#EAF0E6",
  },
  total: { color: colors.ink, fontSize: 27, fontWeight: "800", marginTop: 5 },
  error: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: 16,
  },
});
