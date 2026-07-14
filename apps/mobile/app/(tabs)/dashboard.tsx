import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS } from "@arca/domain";
import { DonutChart } from "@/components/DonutChart";
import { Card, ScreenHeader } from "@/components/ui";
import { useApp, useRebalance } from "@/providers/AppProvider";
import { arcaColors, colors, money, pct } from "@/theme";

export default function Dashboard() {
  const { portfolio, syncQuotes, rebalanceAcknowledged } = useApp();
  const rebalance = useRebalance();
  const hasAlert =
    !rebalanceAcknowledged &&
    rebalance.suggestions.some((item) => item.outsideTolerance);
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={syncQuotes} />
        }
      >
        <ScreenHeader
          title="Dashboard"
          subtitle="Sua estratégia em cinco segundos"
          action={
            <Pressable
              accessibilityLabel="Abrir configurações"
              onPress={() => router.push("/settings")}
            >
              <Ionicons name="settings-outline" size={25} color={colors.ink} />
            </Pressable>
          }
        />
        <Card style={styles.totalCard}>
          <Text style={styles.totalLabel}>Patrimônio total</Text>
          <Text style={styles.total}>{money(portfolio.totalValue)}</Text>
          <Text
            style={[
              styles.variation,
              {
                color:
                  Number(portfolio.returnPercent ?? 0) >= 0
                    ? colors.success
                    : colors.danger,
              },
            ]}
          >
            {portfolio.returnPercent
              ? pct(portfolio.returnPercent)
              : "Sem custo base"}{" "}
            desde os aportes
          </Text>
        </Card>
        {hasAlert ? (
          <Pressable
            onPress={() => router.push("/(tabs)/rebalance")}
            style={styles.alert}
          >
            <Ionicons name="alert-circle" size={24} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text style={styles.alertTitle}>Rebalanceamento sugerido</Text>
              <Text style={styles.alertText}>
                Há quadrantes fora da tolerância configurada.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.danger} />
          </Pressable>
        ) : null}
        <Card style={{ alignItems: "center" }}>
          <DonutChart allocations={portfolio.allocations} />
        </Card>
        <Text style={styles.sectionTitle}>Distribuição de Ativos</Text>
        <Card style={{ paddingVertical: 6 }}>
          {portfolio.allocations.map((item, index) => (
            <View
              key={item.arcaClass}
              style={[styles.row, index > 0 && styles.rowBorder]}
            >
              <View
                style={[
                  styles.classIcon,
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
                <Text style={styles.rowTitle}>
                  {ARCA_LABELS[item.arcaClass]}
                </Text>
                <Text style={styles.rowValue}>{money(item.value)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.percent}>
                  {Number(item.percent).toFixed(1)}%
                </Text>
                <Text
                  style={{
                    color:
                      Number(item.returnPercent ?? 0) >= 0
                        ? colors.success
                        : colors.danger,
                    fontSize: 12,
                  }}
                >
                  {item.returnPercent ? pct(item.returnPercent) : "—"}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
      <Pressable
        accessibilityLabel="Registrar novo aporte"
        onPress={() => router.push("/contribution")}
        style={styles.fab}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
  totalCard: { backgroundColor: colors.navy },
  totalLabel: { color: "#CBD5E1", fontSize: 13 },
  total: { color: "#FFF", fontSize: 30, fontWeight: "900", marginVertical: 6 },
  variation: { fontWeight: "700", fontSize: 12 },
  alert: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 15,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 14,
  },
  alertTitle: { color: "#991B1B", fontWeight: "800" },
  alertText: { color: "#B91C1C", fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink,
    marginTop: 22,
    marginBottom: 10,
  },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  classIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  rowTitle: { color: colors.ink, fontWeight: "700" },
  rowValue: { color: colors.muted, fontSize: 12, marginTop: 3 },
  percent: { fontWeight: "900", color: colors.ink },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
  },
});
