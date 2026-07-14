import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { DonutChart } from "@/components/DonutChart";
import { useApp, useRebalance } from "@/providers/AppProvider";
import { arcaColors, colors, money, pct } from "@/theme";
import { acknowledgeLatestSnapshot } from "@/db/database";

export default function Rebalance() {
  const { portfolio, refresh } = useApp();
  const plan = useRebalance();
  const [simulating, setSimulating] = useState(false);
  const preview = simulating
    ? portfolio.allocations.map((item) => ({
        ...item,
        percent: item.targetPercent,
      }))
    : portfolio.allocations;
  async function acknowledge() {
    await acknowledgeLatestSnapshot();
    await refresh();
    Alert.alert(
      "Alerta silenciado",
      "Uma nova cotação ou movimentação reavaliará a carteira.",
    );
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Rebalanceamento"
          subtitle="Ajustes para voltar às metas"
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
                {pct(item.driftPercentagePoints)} p.p.
              </Text>
            </View>
            <View style={styles.suggestion}>
              <Text style={styles.action}>
                {item.action === "BUY"
                  ? "Comprar"
                  : item.action === "SELL"
                    ? "Realocar"
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
              : "Simular rebalanceamento"
          }
          onPress={() => setSimulating(!simulating)}
        />
        <View style={{ height: 10 }} />
        <Button
          title="Marcar como feito"
          variant="secondary"
          onPress={acknowledge}
        />
        <Text style={styles.note}>
          Marcar como feito não altera suas posições. Registre compras ou vendas
          na tela Novo Aporte.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
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
