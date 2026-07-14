import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  aggregateSnapshots,
  type ArcaClass,
  type HistoryPeriod,
  type SnapshotValue,
} from "@arca/domain";
import { Card, ScreenHeader } from "@/components/ui";
import { LineChart } from "@/components/LineChart";
import { MultiLineChart } from "@/components/MultiLineChart";
import { listClassSnapshots, listSnapshots } from "@/db/database";
import { arcaColors, colors, money, pct } from "@/theme";

export default function History() {
  const [period, setPeriod] = useState<HistoryPeriod>("WEEKLY");
  const [snapshots, setSnapshots] = useState<SnapshotValue[]>([]);
  const [classSnapshots, setClassSnapshots] = useState<
    Array<{ capturedAt: string; arcaClass: ArcaClass; value: string }>
  >([]);
  const [byClass, setByClass] = useState(false);
  useEffect(() => {
    async function loadHistory() {
      const total = await listSnapshots();
      const classes = await listClassSnapshots();
      setSnapshots(total);
      setClassSnapshots(classes);
    }
    loadHistory().catch(console.error);
  }, []);
  const items = useMemo(
    () => aggregateSnapshots(snapshots, period),
    [snapshots, period],
  );
  const classSeries = useMemo(
    () =>
      (
        [
          "BRAZIL_STOCKS",
          "REAL_ESTATE",
          "CASH_FIXED_INCOME",
          "INTERNATIONAL",
        ] as ArcaClass[]
      ).map((arcaClass) => ({
        color: arcaColors[arcaClass],
        values: aggregateSnapshots(
          classSnapshots
            .filter((item) => item.arcaClass === arcaClass)
            .map((item) => ({
              capturedAt: item.capturedAt,
              totalValue: item.value,
            })),
          period,
        ).map((item) => Number(item.totalValue)),
      })),
    [classSnapshots, period],
  );
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Histórico"
          subtitle="Crescimento da carteira no tempo"
        />
        <View style={styles.chips}>
          {(
            [
              ["WEEKLY", "Semanal"],
              ["FORTNIGHTLY", "Quinzenal"],
              ["MONTHLY", "Mensal"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setPeriod(value)}
              style={[styles.chip, period === value && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  period === value && styles.chipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: byClass }}
          onPress={() => setByClass(!byClass)}
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>Visualização por quadrante</Text>
          <View
            style={[
              styles.switchTrack,
              byClass && { backgroundColor: colors.primary },
            ]}
          >
            <View
              style={[
                styles.switchKnob,
                byClass && { transform: [{ translateX: 18 }] },
              ]}
            />
          </View>
        </Pressable>
        <Card>
          <Text style={styles.cardTitle}>
            {byClass ? "Evolução por Quadrante" : "Crescimento da Carteira"}
          </Text>
          {items.length > 1 ? (
            byClass ? (
              <MultiLineChart series={classSeries} />
            ) : (
              <LineChart
                series={items.map((item) => Number(item.totalValue))}
              />
            )
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Histórico em construção</Text>
              <Text style={styles.emptyText}>
                Novos snapshots são registrados ao usar e sincronizar o app.
              </Text>
            </View>
          )}
        </Card>
        <Text style={styles.section}>Registros</Text>
        <Card style={{ paddingVertical: 4 }}>
          {items.map((item, index) => {
            const previous = items[index - 1];
            const change =
              previous && Number(previous.totalValue)
                ? (Number(item.totalValue) / Number(previous.totalValue) - 1) *
                  100
                : null;
            return (
              <View
                key={item.capturedAt}
                style={[styles.row, index > 0 && styles.border]}
              >
                <View>
                  <Text style={styles.date}>
                    {new Date(item.capturedAt).toLocaleDateString("pt-BR")}
                  </Text>
                  <Text style={styles.value}>{money(item.totalValue)}</Text>
                </View>
                <Text
                  style={{
                    color:
                      change == null
                        ? colors.muted
                        : change >= 0
                          ? colors.success
                          : colors.danger,
                    fontWeight: "800",
                  }}
                >
                  {change == null ? "—" : pct(change)}
                </Text>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
  chips: { flexDirection: "row", gap: 8, marginBottom: 10 },
  chip: {
    flex: 1,
    borderRadius: 20,
    padding: 9,
    alignItems: "center",
    backgroundColor: "#E8ECF3",
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.muted, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },
  toggle: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  toggleText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
  switchTrack: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#CBD5E1",
    padding: 2,
  },
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFF",
  },
  cardTitle: { fontWeight: "900", color: colors.ink, marginBottom: 12 },
  empty: {
    height: 170,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  emptyTitle: { color: colors.ink, fontWeight: "900" },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    marginTop: 7,
    lineHeight: 19,
  },
  section: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 18,
    marginTop: 22,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
  },
  border: { borderTopWidth: 1, borderTopColor: colors.border },
  date: { color: colors.ink, fontWeight: "700" },
  value: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
