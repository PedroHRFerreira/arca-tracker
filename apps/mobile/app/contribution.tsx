import { useMemo, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_SHORT_LABELS, type ArcaClass } from "@arca/domain";
import { Button, ScreenHeader } from "@/components/ui";
import {
  addBalanceAdjustment,
  addTransaction,
  createAsset,
} from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { colors, money } from "@/theme";

const classes: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];
export default function Contribution() {
  const params = useLocalSearchParams<{
    assetId?: string;
    symbol?: string;
    name?: string;
    arcaClass?: ArcaClass;
  }>();
  const { assets, refresh } = useApp();
  const [assetId, setAssetId] = useState(params.assetId ?? "");
  const [symbol, setSymbol] = useState(params.symbol ?? "");
  const [name, setName] = useState(params.name ?? "");
  const [arcaClass, setClass] = useState<ArcaClass>(
    params.arcaClass ?? "BRAZIL_STOCKS",
  );
  const [type, setType] = useState<"BUY" | "SELL" | "BALANCE">("BUY");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const total = useMemo(
    () => Number(quantity || 0) * Number(price || 0),
    [quantity, price],
  );
  async function save() {
    try {
      setSaving(true);
      let selectedId = assetId;
      if (!selectedId)
        selectedId = await createAsset({
          symbol: symbol || `MANUAL-${Date.now()}`,
          name: name || symbol || "Ativo manual",
          arcaClass,
          assetType: type === "BALANCE" ? "BALANCE" : "MARKET",
          quoteMode: symbol ? "API" : "MANUAL",
        });
      const date = new Date().toISOString().slice(0, 10);
      if (type === "BALANCE")
        await addBalanceAdjustment(selectedId, date, balance);
      else
        await addTransaction({
          assetId: selectedId,
          type,
          tradeDate: date,
          quantity,
          unitPrice: price,
        });
      await refresh();
      router.back();
    } catch (error) {
      Alert.alert(
        "Não foi possível salvar",
        error instanceof Error && error.message === "INSUFFICIENT_POSITION"
          ? "A venda é maior que a posição disponível."
          : "Revise os campos e tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }
  const valid =
    assetId || (name.trim() && (symbol.trim() || type === "BALANCE"));
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Novo Aporte"
          subtitle="Registre uma compra, venda ou saldo"
        />
        {assets.length ? (
          <>
            <Text style={styles.label}>Ativo existente</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 18 }}
            >
              {assets.map((asset) => (
                <Pressable
                  key={asset.id}
                  onPress={() => {
                    setAssetId(asset.id);
                    setClass(asset.arcaClass);
                  }}
                  style={[
                    styles.assetChip,
                    assetId === asset.id && styles.assetChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.assetChipText,
                      assetId === asset.id && { color: "#FFF" },
                    ]}
                  >
                    {asset.symbol}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
        {!assetId ? (
          <>
            <Field
              label="Ticker"
              value={symbol}
              onChange={setSymbol}
              autoCapitalize="characters"
            />
            <Field label="Nome" value={name} onChange={setName} />
            <Text style={styles.label}>Quadrante</Text>
            <View style={styles.wrap}>
              {classes.map((item) => (
                <Pressable
                  key={item}
                  onPress={() => setClass(item)}
                  style={[
                    styles.classChip,
                    arcaClass === item && styles.classChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.classText,
                      arcaClass === item && { color: "#FFF" },
                    ]}
                  >
                    {ARCA_SHORT_LABELS[item]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Movimentação</Text>
        <View style={styles.segment}>
          {(
            [
              ["BUY", "Compra"],
              ["SELL", "Venda"],
              ["BALANCE", "Ajuste de saldo"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setType(value)}
              style={[
                styles.segmentItem,
                type === value && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  type === value && { color: colors.primary },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {type === "BALANCE" ? (
          <Field
            label="Saldo atual (R$)"
            value={balance}
            onChange={setBalance}
            keyboardType="decimal-pad"
          />
        ) : (
          <>
            <Field
              label="Quantidade"
              value={quantity}
              onChange={setQuantity}
              keyboardType="decimal-pad"
            />
            <Field
              label="Preço unitário (R$)"
              value={price}
              onChange={setPrice}
              keyboardType="decimal-pad"
            />
            <View style={styles.total}>
              <Text style={styles.totalLabel}>Valor total</Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>
          </>
        )}
        <Button
          title={saving ? "Salvando…" : "Salvar movimentação"}
          disabled={
            !valid ||
            saving ||
            (type === "BALANCE" ? !balance : !quantity || !price)
          }
          onPress={save}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
function Field({
  label,
  value,
  onChange,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  [key: string]: unknown;
}) {
  return (
    <View style={{ marginBottom: 15 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        style={styles.input}
        {...props}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  label: { color: colors.ink, fontWeight: "800", marginBottom: 7 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 50,
    fontSize: 16,
  },
  assetChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#E8ECF3",
    borderRadius: 18,
    marginRight: 8,
  },
  assetChipActive: { backgroundColor: colors.primary },
  assetChipText: { fontWeight: "800", color: colors.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 18 },
  classChip: { padding: 9, borderRadius: 10, backgroundColor: "#E8ECF3" },
  classChipActive: { backgroundColor: colors.primary },
  classText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  segment: {
    flexDirection: "row",
    backgroundColor: "#E8ECF3",
    padding: 4,
    borderRadius: 12,
    marginBottom: 18,
  },
  segmentItem: { flex: 1, padding: 9, alignItems: "center", borderRadius: 9 },
  segmentActive: { backgroundColor: "#FFF" },
  segmentText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  total: {
    backgroundColor: colors.navy,
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  totalLabel: { color: "#CBD5E1" },
  totalValue: { color: "#FFF", fontWeight: "900", fontSize: 22, marginTop: 5 },
});
