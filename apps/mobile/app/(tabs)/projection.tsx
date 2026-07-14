import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { calculateProjection } from "@arca/domain";
import { Card, Button, ScreenHeader } from "@/components/ui";
import { MultiLineChart } from "@/components/MultiLineChart";
import { getProjectionSettings, saveProjectionSettings } from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { colors, money } from "@/theme";

export default function Projection() {
  const { portfolio } = useApp();
  const [annualRate, setAnnualRate] = useState("8");
  const [monthlyContribution, setContribution] = useState("1000");
  const [offset, setOffset] = useState("3");
  const [years, setYears] = useState("20");
  useEffect(() => {
    getProjectionSettings().then((value) => {
      if (value) {
        setAnnualRate(value.annualRate);
        setContribution(value.monthlyContribution);
        setOffset(value.offsetPoints);
        setYears(String(value.horizonYears));
      }
    });
  }, []);
  const points = useMemo(() => {
    try {
      return calculateProjection({
        presentValue: portfolio.totalValue,
        monthlyContribution,
        annualRatePercent: annualRate,
        offsetPercentagePoints: offset,
        years: Math.max(1, Number(years) || 1),
      });
    } catch {
      return [];
    }
  }, [portfolio.totalValue, monthlyContribution, annualRate, offset, years]);
  const final = points.at(-1);
  async function save() {
    await saveProjectionSettings({
      annualRate,
      monthlyContribution,
      offsetPoints: offset,
      horizonYears: Number(years),
    });
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Projeção"
          subtitle="Simule cenários de longo prazo"
        />
        <View style={styles.fields}>
          <Field
            label="Taxa a.a."
            value={annualRate}
            onChange={setAnnualRate}
            suffix="%"
          />
          <Field
            label="Aporte/mês"
            value={monthlyContribution}
            onChange={setContribution}
            suffix="R$"
          />
          <Field label="Anos" value={years} onChange={setYears} />
        </View>
        <Card>
          <Text style={styles.cardTitle}>Crescimento Projetado</Text>
          <MultiLineChart
            series={[
              {
                color: colors.danger,
                values: points
                  .filter((_, index) => index % 12 === 0)
                  .map((item) => Number(item.pessimistic)),
              },
              {
                color: colors.primary,
                values: points
                  .filter((_, index) => index % 12 === 0)
                  .map((item) => Number(item.neutral)),
              },
              {
                color: colors.success,
                values: points
                  .filter((_, index) => index % 12 === 0)
                  .map((item) => Number(item.optimistic)),
              },
            ]}
          />
          <View style={styles.legend}>
            <Legend color={colors.danger} label="Pessimista" />
            <Legend color={colors.primary} label="Neutro" />
            <Legend color={colors.success} label="Otimista" />
          </View>
        </Card>
        <Card style={styles.estimate}>
          <Text style={styles.estimateLabel}>
            Estimativa final · cenário neutro
          </Text>
          <Text style={styles.estimateValue}>
            {money(final?.neutral ?? "0")}
          </Text>
          <Text style={styles.estimateText}>
            Em {years} anos, com aporte de {money(monthlyContribution)}/mês a{" "}
            {annualRate}% a.a.
          </Text>
        </Card>
        <Button title="Salvar cenário padrão" onPress={save} />
        <Text style={styles.disclaimer}>
          Projeção é uma estimativa, não uma garantia. Taxas, aportes e
          horizonte são parâmetros definidos por você.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          style={styles.input}
        />
      </View>
    </View>
  );
}
function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View
        style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }}
      />
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
  fields: { flexDirection: "row", gap: 8, marginBottom: 14 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 5,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    minHeight: 45,
    paddingHorizontal: 8,
  },
  suffix: { color: colors.muted, fontSize: 11 },
  input: { flex: 1, color: colors.ink, fontWeight: "800", textAlign: "right" },
  cardTitle: { color: colors.ink, fontWeight: "900" },
  legend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 6,
  },
  estimate: { backgroundColor: colors.navy, marginVertical: 14 },
  estimateLabel: { color: "#CBD5E1", fontSize: 12 },
  estimateValue: {
    color: "#FFF",
    fontWeight: "900",
    fontSize: 28,
    marginVertical: 8,
  },
  estimateText: { color: "#CBD5E1", lineHeight: 19 },
  disclaimer: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 17,
    margin: 18,
  },
});
