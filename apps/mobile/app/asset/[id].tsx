import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ARCA_LABELS } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import {
  archiveAsset,
  getAsset,
  listAssetTransactions,
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
  const { refresh } = useApp();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  useEffect(() => {
    if (!id) return;
    async function loadAsset() {
      const nextAsset = await getAsset(id);
      const nextTransactions = await listAssetTransactions(id);
      setAsset(nextAsset);
      setTransactions(nextTransactions);
    }
    loadAsset().catch(console.error);
  }, [id]);
  if (!asset)
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text>Carregando ativo…</Text>
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
            await archiveAsset(assetId);
            await refresh();
            router.replace("/(tabs)/assets");
          },
        },
      ],
    );
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title={asset.symbol}
          subtitle={`${asset.name} · ${ARCA_LABELS[asset.arcaClass]}`}
        />
        <Card style={styles.quote}>
          <Text style={styles.quoteLabel}>Último preço conhecido</Text>
          <Text style={styles.quoteValue}>
            {asset.price ? money(asset.price) : "Sem cotação"}
          </Text>
          <Text style={styles.quoteDate}>
            {asset.priceCapturedAt
              ? new Date(asset.priceCapturedAt).toLocaleString("pt-BR")
              : "Registre uma movimentação ou sincronize."}
          </Text>
        </Card>
        <Text style={styles.section}>Aportes e vendas</Text>
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
  quoteDate: { color: "#94A3B8", fontSize: 11 },
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
  date: { color: colors.muted, fontSize: 12, marginTop: 3 },
  value: { color: colors.ink, fontWeight: "900" },
});
