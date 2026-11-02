import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { DonutChart } from "@/components/DonutChart";
import { useApp, useRebalance } from "@/providers/AppProvider";
import { arcaColors, colors, money, layout } from "@/theme";
import { acknowledgeLatestSnapshot } from "@/db/database";

export default function Rebalance() {
  const { strategyPortfolio: portfolio, refresh } = useApp();
  const plan = useRebalance();
  const [simulating, setSimulating] = useState(false);
  const preview = simulating
    ? portfolio.allocations.map((item) => ({
        ...item,
        percent: item.targetPercent,
      }))
    : portfolio.allocations;
  async function acknowledge() {
    try {
      await acknowledgeLatestSnapshot();
      await refresh();
      Alert.alert(
        "Aviso revisado",
        "Uma nova cotação ou movimentação reavaliará a carteira.",
      );
    } catch {
      Alert.alert(
        "Não foi possível salvar",
        "Tente novamente. Seus investimentos foram preservados.",
      );
    }
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          back
          title="Ajustar a distribuição"
          subtitle="Uma simulação para revisar com calma"
        />
        <Card style={styles.total}>
          <Text style={styles.totalLabel}>Valor total a movimentar</Text>
          <Text style={styles.totalValue}>{money(plan.totalToMove)}</Text>
          <Text style={styles.totalHint}>
            Soma das compras sugeridas, sem dupla contagem.
          </Text>
        </Card>
        {plan.suggestions.map((item) => (
          <Card key={item.arcaClass} style={styles.item}>
            <View style={styles.row}>
              <View
                style={[
                  styles.icon,
                  { backgroundColor: `${arcaColors[item.arcaClass]}18` },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: arcaColors[item.arcaClass] },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{ARCA_LABELS[item.arcaClass]}</Text>
                <Text style={styles.current}>
                  {money(item.currentValue)} atuais
                </Text>
              </View>
              <Text
                style={[
                  styles.drift,
                  {
                    color: item.outsideTolerance
                      ? colors.danger
                      : colors.success,
                  },
                ]}
              >
                {Math.abs(Number(item.driftPercentagePoints)).toFixed(1)} pontos{" "}
                {Number(item.driftPercentagePoints) >= 0 ? "acima" : "abaixo"}{" "}
                da meta
              </Text>
            </View>
            <View style={styles.suggestion}>
              <Text style={styles.action}>
                {item.action === "BUY"
                  ? "Simular compra"
                  : item.action === "SELL"
                    ? "Simular venda"
                    : "Dentro da meta"}
              </Text>
              <Text style={styles.amount}>{money(item.amount)}</Text>
            </View>
          </Card>
        ))}
        <Card style={{ alignItems: "center" }}>
          <Text style={styles.preview}>
            {simulating ? "Distribuição simulada" : "Distribuição atual"}
          </Text>
          <DonutChart allocations={preview} size={150} />
        </Card>
        <Button
          title={
            simulating
              ? "Voltar à distribuição atual"
              : "Simular distribuição nas metas"
          }
          onPress={() => setSimulating(!simulating)}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Já revisei este aviso"
          variant="secondary"
          onPress={acknowledge}
        />
        <Text style={styles.note}>
          Esta simulação não realiza operações nem altera suas posições. A
          reserva fica separada. Se decidir comprar ou vender na sua
          instituição, registre a movimentação na Carteira.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: layout.tabBottomSpace },
  total: { backgroundColor: colors.navy },
  totalLabel: { color: "#CBD5E1" },
  totalValue: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 28,
    marginVertical: 6,
  },
  totalHint: { color: "#94A3B8", fontSize: 11 },
  item: { marginTop: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { color: colors.ink, fontWeight: "800" },
  current: { color: colors.muted, fontSize: 11, marginTop: 2 },
  drift: { fontWeight: "900", fontSize: 12 },
  suggestion: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 12,
    paddingTop: 12,
  },
  action: { color: colors.muted },
  amount: { color: colors.ink, fontWeight: "900" },
  preview: { color: colors.ink, fontWeight: "900", alignSelf: "flex-start" },
  note: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    margin: 16,
  },
});
