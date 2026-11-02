import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  calculateProjection,
  localDateString,
  parseMoneyInput,
  projectPlan,
} from "@arca/domain";
import { MoneyInput } from "@/components/MoneyInput";
import { Card, Button, ScreenHeader } from "@/components/ui";
import { MultiLineChart } from "@/components/MultiLineChart";
import {
  getProjectionSettings,
  saveProjectionSettings,
  getSetting,
  setSetting,
} from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { colors, money, layout } from "@/theme";

type SavedScenario = NonNullable<
  Awaited<ReturnType<typeof getProjectionSettings>>
>;
const frequencyLabels = {
  MONTHLY: "por mês",
  WEEKLY: "por semana",
  FORTNIGHTLY: "a cada 15 dias",
};
function rateInput(value: string): number {
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(value.trim()))
    throw new Error("Informe taxas válidas, com até duas casas decimais.");
  return Number(value.replace(",", "."));
}
export default function Projection({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { portfolio, activePlan } = useApp();
  const [annualRate, setAnnualRate] = useState("0");
  const [monthlyContribution, setContribution] = useState("0");
  const [variation, setVariation] = useState("0");
  const [years, setYears] = useState("10");
  const [scenario, setScenario] = useState(false);
  const [legacyMode, setLegacyMode] = useState(false);
  const [saved, setSaved] = useState<SavedScenario | null>(null);
  const [savedPlan, setSavedPlan] = useState<{
    annualRate: string;
    variation: string;
    years: string;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      getProjectionSettings(),
      getSetting("projection_legacy_available"),
    ])
      .then(([value, available]) => {
        if (mounted && available !== "false") setSaved(value);
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Não foi possível carregar o cenário salvo. Abra esta tela novamente para tentar.",
          );
      });
    getSetting("projection_plan_premises")
      .then((value) => {
        if (!value || !mounted) return;
        const parsed = JSON.parse(value);
        if (
          [parsed.annualRate, parsed.variation, parsed.years].every(
            (item) => typeof item === "string",
          )
        )
          setSavedPlan(parsed);
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Não foi possível carregar as premissas salvas. Você pode simular novamente.",
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  useEffect(() => {
    if (activePlan) setYears(String(activePlan.horizonYears));
  }, [activePlan]);
  const projection = useMemo(() => {
    try {
      if (activePlan?.hasExpensiveDebt)
        return {
          error: "",
          series: [] as number[][],
          final: portfolio.totalValue,
        };
      const horizon = Number(years.replace(",", "."));
      if (!Number.isFinite(horizon) || horizon < 0.1 || horizon > 100)
        throw new Error("Escolha um prazo entre 0,1 e 100 anos.");
      const rate = scenario ? rateInput(annualRate) : 0;
      const range = scenario ? rateInput(variation) : 0;
      if (
        range < 0 ||
        range > 100 ||
        rate - range <= -100 ||
        rate + range > 100
      )
        throw new Error(
          "Use variação entre 0 e 100 pontos e taxas finais maiores que -100% e até 100% ao ano.",
        );
      if (legacyMode) {
        if (!Number.isInteger(horizon) || horizon > 80)
          throw new Error(
            "No cenário mensal anterior, informe um número inteiro entre 1 e 80 anos.",
          );
        const points = calculateProjection({
          presentValue: portfolio.totalValue,
          monthlyContribution: parseMoneyInput(monthlyContribution),
          annualRatePercent: String(rate),
          offsetPercentagePoints: String(range),
          years: horizon,
        });
        return {
          error: "",
          series: [
            points.map((p) => Number(p.pessimistic)),
            points.map((p) => Number(p.neutral)),
            points.map((p) => Number(p.optimistic)),
          ],
          final: points.at(-1)?.neutral ?? "0",
        };
      }
      if (!activePlan)
        return { error: "", series: [] as number[][], final: "0" };
      const start = new Date();
      const through = new Date(
        start.getFullYear(),
        start.getMonth() + Math.round(horizon * 12),
        1,
        12,
      );
      through.setDate(
        Math.min(
          start.getDate(),
          new Date(
            through.getFullYear(),
            through.getMonth() + 1,
            0,
            12,
          ).getDate(),
        ),
      );
      const series = [rate - range, rate, rate + range].map(
        (annualRatePercent) =>
          projectPlan({
            profile: activePlan,
            presentValue: portfolio.totalValue,
            startDate: localDateString(start),
            throughDate: localDateString(through),
            annualRatePercent: String(annualRatePercent),
          }).map((point) => Number(point.value)),
      );
      return { error: "", series, final: String(series[1]?.at(-1) ?? 0) };
    } catch (error) {
      return {
        error:
          error instanceof Error && error.name !== "ZodError"
            ? error.message
            : "Revise o aporte: use um valor positivo com até dois centavos, como 1.000,50.",
        series: [] as number[][],
        final: "0",
      };
    }
  }, [
    activePlan,
    annualRate,
    monthlyContribution,
    portfolio.totalValue,
    scenario,
    variation,
    years,
    legacyMode,
  ]);
  function loadSaved() {
    if (!saved) return;
    setAnnualRate(saved.annualRate);
    setVariation(saved.offsetPoints);
    setContribution(saved.monthlyContribution);
    setYears(String(saved.horizonYears));
    setScenario(true);
    setLegacyMode(true);
    setMessage(
      "Cenário anterior carregado: utiliza aportes mensais, independentemente do plano atual.",
    );
  }
  async function save() {
    if (projection.error) return;
    setSaving(true);
    try {
      const value = {
        annualRate: String(rateInput(annualRate)),
        monthlyContribution: legacyMode
          ? parseMoneyInput(monthlyContribution)
          : (saved?.monthlyContribution ?? "0"),
        offsetPoints: String(rateInput(variation)),
        horizonYears: Number(years.replace(",", ".")),
      };
      if (legacyMode) {
        await saveProjectionSettings(value);
        setSaved(value);
      } else {
        const premises = {
          annualRate: value.annualRate,
          variation: value.offsetPoints,
          years: String(value.horizonYears),
        };
        await setSetting("projection_plan_premises", JSON.stringify(premises));
        setSavedPlan(premises);
      }
      setMessage("Premissas salvas. Seu plano de aportes continua o mesmo.");
    } catch {
      setMessage(
        "Não foi possível salvar. Revise os campos e tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }
  const chartValues = (values: number[] = []) =>
    values.filter(
      (_, index) =>
        index % Math.max(1, Math.ceil(values.length / 120)) === 0 ||
        index === values.length - 1,
    );
  const content = (
    <>
      {!embedded && (
        <ScreenHeader
          title="Projeção"
          subtitle="Veja o que a constância pode construir"
        />
      )}
      {activePlan?.hasExpensiveDebt ? (
        <Card>
          <Text style={styles.title}>Primeiro, cuide das dívidas caras</Text>
          <Text style={styles.hint}>
            Seu próximo aporte está destinado a resolver as dívidas. Esse
            pagamento não vira patrimônio investido. Depois de quitar, revise o
            plano e confirme a resolução para simular seus investimentos.
          </Text>
          <Button
            title="Revisar meu plano"
            onPress={() => router.push("/onboarding?mode=edit")}
          />
        </Card>
      ) : !activePlan && !legacyMode ? (
        <Card>
          <Text style={styles.title}>Dê um destino aos seus aportes</Text>
          <Text style={styles.hint}>
            Crie seu plano para projetar com o valor, a frequência e as datas
            que fazem sentido para você.
          </Text>
          <Button
            title="Criar meu plano"
            onPress={() => router.push("/onboarding")}
          />
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.title}>
              {legacyMode
                ? "Cenário mensal anterior"
                : "Seu plano, ao longo do tempo"}
            </Text>
            <Text style={styles.hint}>
              Começamos com {money(portfolio.totalValue)} cadastrados na
              carteira. Valores apenas declarados no planejamento não entram
              neste saldo.
            </Text>
            {!legacyMode && activePlan && (
              <Text style={styles.summary}>
                {money(activePlan.contributionAmount)}{" "}
                {frequencyLabels[activePlan.frequency]} · primeira data:{" "}
                {new Date(
                  `${activePlan.firstContributionDate}T12:00:00`,
                ).toLocaleDateString("pt-BR")}
              </Text>
            )}
            {legacyMode && (
              <Field
                label="Aporte mensal do cenário (R$)"
                value={monthlyContribution}
                onChange={setContribution}
              />
            )}
            <Field
              label="Por quantos anos?"
              value={years}
              onChange={setYears}
            />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Incluir rendimento hipotético</Text>
                <Text style={styles.hint}>
                  Desligado: apenas saldo atual e novos aportes.
                </Text>
              </View>
              <Switch
                accessibilityLabel="Incluir rendimento hipotético"
                value={scenario}
                onValueChange={setScenario}
                trackColor={{ true: colors.primary }}
              />
            </View>
            {scenario && (
              <View style={styles.fields}>
                <Field
                  label="Rendimento anual (%)"
                  value={annualRate}
                  onChange={setAnnualRate}
                />
                <Field
                  label="Variação (pontos percentuais)"
                  value={variation}
                  onChange={setVariation}
                />
              </View>
            )}
          </Card>
          {projection.error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {projection.error}
            </Text>
          ) : (
            <Card style={styles.gap}>
              <Text style={styles.title}>
                {scenario
                  ? "Resultados nas suas premissas"
                  : "Acumulado sem rendimento"}
              </Text>
              <MultiLineChart
                series={
                  scenario
                    ? [
                        {
                          color: colors.danger,
                          values: chartValues(projection.series[0]),
                        },
                        {
                          color: colors.primary,
                          values: chartValues(projection.series[1]),
                        },
                        {
                          color: colors.success,
                          values: chartValues(projection.series[2]),
                        },
                      ]
                    : [
                        {
                          color: colors.primary,
                          values: chartValues(projection.series[1]),
                        },
                      ]
                }
              />
              {scenario && (
                <Text style={styles.hint}>
                  Vermelho: taxa menor · verde escuro: taxa central · verde
                  claro: taxa maior.
                </Text>
              )}
              <Text style={styles.amount}>{money(projection.final)}</Text>
              <Text style={styles.hint}>
                {scenario
                  ? "Valor final no cenário central"
                  : "Saldo atual + aportes futuros"}{" "}
                em {years} anos.
              </Text>
            </Card>
          )}
          {scenario && (
            <Button
              title={saving ? "Salvando…" : "Salvar premissas do cenário"}
              disabled={!!projection.error || saving}
              onPress={save}
            />
          )}
          {legacyMode && activePlan && (
            <View style={styles.gap}>
              <Button
                title="Voltar à frequência do meu plano"
                variant="secondary"
                onPress={() => {
                  setLegacyMode(false);
                  setScenario(false);
                  setYears(String(activePlan.horizonYears));
                  setMessage("");
                }}
              />
            </View>
          )}
          <Text style={styles.hint}>
            Simulação educativa: não garante retorno e não desconta inflação,
            impostos ou custos. Aportes são suposições futuras; durante o
            pagamento de dívidas podem não virar patrimônio investido.
          </Text>
        </>
      )}
      {savedPlan &&
        !legacyMode &&
        activePlan &&
        !activePlan.hasExpensiveDebt && (
          <View style={styles.gap}>
            <Button
              title="Carregar minhas premissas de rendimento"
              variant="secondary"
              onPress={() => {
                setAnnualRate(savedPlan.annualRate);
                setVariation(savedPlan.variation);
                setYears(savedPlan.years);
                setScenario(true);
                setMessage(
                  "Premissas carregadas com a frequência do seu plano atual.",
                );
              }}
            />
          </View>
        )}
      {saved && !legacyMode && !activePlan?.hasExpensiveDebt && (
        <View style={styles.gap}>
          <Button
            title="Consultar cenário mensal salvo anteriormente"
            variant="secondary"
            onPress={loadSaved}
          />
        </View>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          {message}
        </Text>
      )}
    </>
  );
  return embedded ? (
    <View>{content}</View>
  ) : (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const Input = label.endsWith("(R$)") ? MoneyInput : TextInput;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={styles.input}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: layout.tabBottomSpace },
  title: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 8,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginVertical: 8,
  },
  summary: {
    color: colors.primary,
    fontWeight: "700",
    lineHeight: 22,
    marginBottom: 12,
  },
  field: { flexGrow: 1, flexBasis: 130, marginBottom: 12 },
  label: { color: colors.ink, fontSize: 13, marginBottom: 7 },
  input: {
    color: colors.ink,
    backgroundColor: colors.background,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 10,
  },
  amount: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 28,
    marginTop: 16,
  },
  gap: { marginVertical: 14 },
  error: { color: colors.danger, lineHeight: 22, padding: 14 },
});
