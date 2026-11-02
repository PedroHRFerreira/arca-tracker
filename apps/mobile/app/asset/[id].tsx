import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ARCA_LABELS } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import {
  archiveAsset,
  getAsset,
  listAssetTransactions,
  setAssetBucket,
  type Asset,
} from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { colors, money } from "@/theme";

type Transaction = {
  id: string;
  type: "BUY" | "SELL";
  tradeDate: string;
  quantity: string;
  unitPrice: string;
  fees: string;
};
export default function AssetDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { refresh, assets } = useApp();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [error, setError] = useState("");
  const [updatingBucket, setUpdatingBucket] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!id) return;
    async function loadAsset() {
      const nextAsset = await getAsset(id);
      const nextTransactions = await listAssetTransactions(id);
      setAsset(nextAsset);
      if (!nextAsset)
        setError("Este investimento não foi encontrado. Volte à carteira.");
      setTransactions(nextTransactions);
    }
    loadAsset().catch(() =>
      setError(
        "Não foi possível carregar este investimento. Volte à carteira e tente novamente.",
      ),
    );
  }, [id]);
  if (!asset)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text style={styles.date}>{error || "Carregando investimento…"}</Text>
          <View style={{ height: 16 }} />
          <Button
            title="Voltar à carteira"
            variant="secondary"
            onPress={() => router.replace("/(tabs)/assets")}
          />
        </View>
      </SafeAreaView>
    );
  const assetId = asset.id;
  async function remove() {
    Alert.alert(
      "Remover ativo?",
      "O histórico será preservado e o ativo deixará de aparecer na carteira.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await archiveAsset(assetId);
              await refresh();
              router.replace("/(tabs)/assets");
            } catch {
              Alert.alert(
                "Não foi possível remover",
                "Tente novamente. Seu histórico foi preservado.",
              );
            }
          },
        },
      ],
    );
  }
  async function changeBucket() {
    if (!asset) return;
    const nextBucket = asset.bucket === "RESERVE" ? "LONG_TERM" : "RESERVE";
    setUpdatingBucket(true);
    setError("");
    try {
      await setAssetBucket(asset.id, nextBucket);
      setAsset({ ...asset, bucket: nextBucket });
      try {
        await refresh();
      } catch {
        setError(
          "Destino salvo. Atualize a carteira novamente para ver os totais mais recentes.",
        );
      }
    } catch {
      setError("Não foi possível alterar o destino. Tente novamente.");
    } finally {
      setUpdatingBucket(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          back
          title={asset.assetType === "BALANCE" ? asset.name : asset.symbol}
          subtitle={`${asset.name} · ${ARCA_LABELS[asset.arcaClass]}`}
        />
        <Card style={styles.quote}>
          <Text style={styles.quoteLabel}>
            {asset.assetType === "BALANCE"
              ? "Investimento acompanhado por saldo"
              : "Último preço conhecido"}
          </Text>
          <Text style={styles.quoteValue}>
            {asset.assetType === "BALANCE"
              ? money(
                  assets.find((item) => item.id === asset.id)?.currentValue ??
                    "0",
                )
              : asset.price
                ? money(asset.price)
                : "Sem cotação"}
          </Text>
          <Text style={styles.quoteDate}>
            {asset.assetType === "BALANCE"
              ? "Atualize o valor total pela opção Nova movimentação."
              : asset.priceCapturedAt
                ? new Date(asset.priceCapturedAt).toLocaleString("pt-BR")
                : "Registre uma movimentação ou atualize as cotações."}
          </Text>
        </Card>
        <Card style={{ marginTop: 16 }}>
          <Text style={styles.operation}>
            {asset.bucket === "RESERVE"
              ? "Reserva de emergência"
              : "Carteira de longo prazo"}
          </Text>
          <Text style={styles.date}>
            O destino vale para TODO o saldo deste ativo. A reserva fica
            separada das metas de longo prazo, sem somar o dinheiro duas vezes.
          </Text>
          {asset.arcaClass === "CASH_FIXED_INCOME" && (
            <View style={{ marginTop: 16 }}>
              <Button
                title={
                  updatingBucket
                    ? "Atualizando…"
                    : asset.bucket === "RESERVE"
                      ? "Usar todo o saldo no meu objetivo"
                      : "Usar todo o saldo como reserva"
                }
                variant="secondary"
                disabled={updatingBucket}
                onPress={changeBucket}
              />
            </View>
          )}
          {asset.arcaClass !== "CASH_FIXED_INCOME" && (
            <Text style={styles.date}>
              A reserva usa investimentos de caixa ou renda fixa com baixo risco
              e facilidade de resgate.
            </Text>
          )}
        </Card>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.danger, marginVertical: 12 }}
          >
            {error}
          </Text>
        )}
        <Text style={styles.section}>Compras e vendas registradas</Text>
        {transactions.length ? (
          <Card style={{ paddingVertical: 4 }}>
            {transactions.map((item, index) => (
              <View
                key={item.id}
                style={[styles.row, index > 0 && styles.border]}
              >
                <View>
                  <Text style={styles.operation}>
                    {item.type === "BUY" ? "Compra" : "Venda"} · {item.quantity}{" "}
                    cotas
                  </Text>
                  <Text style={styles.date}>
                    {new Date(`${item.tradeDate}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}
                  </Text>
                </View>
                <Text style={styles.value}>
                  {money(Number(item.quantity) * Number(item.unitPrice))}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <Text style={styles.date}>Nenhuma transação para este ativo.</Text>
          </Card>
        )}
        <Button
          title="Nova movimentação"
          onPress={() =>
            router.push({
              pathname: "/contribution",
              params: { assetId: asset.id },
            })
          }
        />
        <View style={{ height: 10 }} />
        <Button title="Remover ativo" variant="danger" onPress={remove} />
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 60 },
  quote: { backgroundColor: colors.navy },
  quoteLabel: { color: "#CBD5E1" },
  quoteValue: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 28,
    marginVertical: 7,
  },
  quoteDate: { color: "#D3E4D8", fontSize: 14, lineHeight: 21 },
  section: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 18,
    marginTop: 22,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 13,
  },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  operation: { color: colors.ink, fontWeight: "800" },
  date: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 6 },
  value: { color: colors.ink, fontWeight: "900" },
});
