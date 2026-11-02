import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS, evaluatePlan, nextContributionDate } from "@arca/domain";
import { DonutChart } from "@/components/DonutChart";
import { Button, Card } from "@/components/ui";
import { PressFeedback, Reveal } from "@/motion/Motion";
import { useApp, useRebalance } from "@/providers/AppProvider";
import { arcaColors, colors, layout, money } from "@/theme";

export default function Dashboard() {
  const {
    portfolio,
    strategyPortfolio,
    activePlan,
    reserveValue,
    registeredReserveValue,
    hasReserveAssets,
    syncQuotes,
    rebalanceAcknowledged,
  } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [hidden, setHidden] = useState(false);
  const rebalance = useRebalance();
  const evaluation = activePlan ? evaluatePlan(activePlan, reserveValue) : null;
  const hasAlert =
    evaluation?.phase === "INVEST" &&
    !rebalanceAcknowledged &&
    rebalance.suggestions.some((item) => item.outsideTolerance);
  const nextDate = activePlan
    ? nextContributionDate(
        activePlan.firstContributionDate,
        activePlan.frequency,
      )
    : null;
  const reserveProgress =
    evaluation && Number(evaluation.reserveTarget) > 0
      ? Math.min(
          100,
          (Number(reserveValue) / Number(evaluation.reserveTarget)) * 100,
        )
      : 0;
  const goalProgress =
    activePlan && Number(activePlan.goalAmount) > 0
      ? Math.min(
          100,
          (Number(strategyPortfolio.totalValue) /
            Number(activePlan.goalAmount)) *
            100,
        )
      : 0;
  const amount = (value: string) => (hidden ? "••••" : money(value));
  const goPlan = () => router.push("/(tabs)/plan");
  const record = () =>
    router.push({
      pathname: "/contribution",
      params: {
        bucket: evaluation?.phase === "RESERVE" ? "RESERVE" : "LONG_TERM",
      },
    });
  async function refreshQuotes() {
    setRefreshing(true);
    setRefreshError("");
    try {
      await syncQuotes();
    } catch {
      setRefreshError(
        "Não foi possível atualizar agora. Seus últimos valores foram mantidos.",
      );
    } finally {
      setRefreshing(false);
    }
  }
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshQuotes}
            tintColor={colors.primary}
          />
        }
      >
        <Reveal style={styles.top}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Ionicons name="boat-outline" size={23} color={colors.primary} />
            </View>
            <View>
              <Text style={styles.brand}>ARCA</Text>
              <Text style={styles.welcome}>Seu futuro, no seu ritmo.</Text>
            </View>
          </View>
          <PressFeedback
            accessibilityRole="button"
            accessibilityLabel="Abrir configurações"
            onPress={() => router.push("/settings")}
            style={styles.iconButton}
          >
            <Ionicons name="settings-outline" size={22} color={colors.ink} />
          </PressFeedback>
        </Reveal>
        <Reveal delay={40} style={styles.balanceCard}>
          <View style={styles.between}>
            <View style={styles.balanceLabel}>
              <View style={styles.liveDot} />
              <Text style={styles.lightLabel}>Seu patrimônio registrado</Text>
            </View>
            <PressFeedback
              accessibilityRole="button"
              accessibilityLabel={
                hidden ? "Mostrar valores" : "Ocultar valores"
              }
              onPress={() => setHidden((value) => !value)}
              style={styles.eye}
            >
              <Ionicons
                name={hidden ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#E9F5ED"
              />
            </PressFeedback>
          </View>
          <Text style={styles.balance}>{amount(portfolio.totalValue)}</Text>
          <Text style={styles.balanceHint}>
            Cada passo conta para o seu futuro.
          </Text>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceBreakdown}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lightSmall}>Reserva registrada</Text>
              <Text style={styles.balanceSmall}>
                {amount(registeredReserveValue)}
              </Text>
            </View>
            <View style={styles.verticalDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lightSmall}>Longo prazo</Text>
              <Text style={styles.balanceSmall}>
                {amount(strategyPortfolio.totalValue)}
              </Text>
            </View>
          </View>
          <View pointerEvents="none" style={styles.balanceOrbit} />
        </Reveal>
        <Reveal delay={90} style={styles.actions}>
          <QuickAction icon="add-outline" title="Registrar" onPress={record} />
          <QuickAction icon="map-outline" title="Meu plano" onPress={goPlan} />
          <QuickAction
            icon="trending-up-outline"
            title="Simular"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/evolution",
                params: { view: "projection" },
              })
            }
          />
          <QuickAction
            icon="time-outline"
            title="Histórico"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/evolution",
                params: { view: "history" },
              })
            }
          />
        </Reveal>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Seu próximo passo</Text>
          <View style={styles.pill}>
            <View style={styles.pillDot} />
            <Text style={styles.pillText}>
              {!evaluation
                ? "Comece aqui"
                : evaluation.phase === "DEBT"
                  ? "Organização"
                  : evaluation.phase === "RESERVE"
                    ? "Sua base"
                    : "Seu objetivo"}
            </Text>
          </View>
        </View>
        <Card style={styles.nextCard}>
          <View style={styles.planHeading}>
            <View style={styles.planIcon}>
              <Ionicons
                name={
                  !evaluation
                    ? "compass-outline"
                    : evaluation.phase === "DEBT"
                      ? "shield-checkmark-outline"
                      : evaluation.phase === "RESERVE"
                        ? "leaf-outline"
                        : "flag-outline"
                }
                size={25}
                color={colors.primary}
              />
            </View>
            <Text style={styles.nextTitle}>
              {!evaluation
                ? "Um plano feito para você"
                : evaluation.phase === "DEBT"
                  ? "Organize as dívidas caras"
                  : evaluation.phase === "RESERVE"
                    ? "Construa sua reserva"
                    : "Invista no seu objetivo"}
            </Text>
          </View>
          <Text style={styles.description}>
            {evaluation?.explanation ??
              "Conte seu objetivo e descubra quanto separar e por onde começar. Uma pergunta de cada vez."}
          </Text>
          {evaluation && (
            <View style={styles.steps}>
              {["Dívidas", "Reserva", "Objetivo"].map((label, index) => (
                <View key={label} style={styles.step}>
                  <View
                    style={[
                      styles.stepDot,
                      index ===
                        ["DEBT", "RESERVE", "INVEST"].indexOf(
                          evaluation.phase,
                        ) && styles.activeDot,
                    ]}
                  />
                  <Text
                    style={[
                      styles.stepText,
                      index ===
                        ["DEBT", "RESERVE", "INVEST"].indexOf(
                          evaluation.phase,
                        ) && { color: colors.primary, fontWeight: "700" },
                    ]}
                  >
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {evaluation?.phase === "RESERVE" && (
            <View style={styles.progressBlock}>
              <View style={styles.between}>
                <Text style={styles.progressLabel}>
                  {hidden
                    ? "••••"
                    : `${money(reserveValue)} de ${money(evaluation.reserveTarget)}`}
                </Text>
                <Text style={styles.progressPercent}>
                  {reserveProgress.toFixed(0)}%
                </Text>
              </View>
              <View
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: reserveProgress }}
                style={styles.track}
              >
                <View style={[styles.fill, { width: `${reserveProgress}%` }]} />
              </View>
              <Text style={styles.microcopy}>
                {hasReserveAssets
                  ? "Saldo dos investimentos da sua reserva."
                  : "Valor informado no plano, separado da carteira registrada."}
              </Text>
            </View>
          )}
          {evaluation?.phase === "INVEST" &&
            activePlan &&
            Number(activePlan.goalAmount) > 0 && (
              <View style={styles.progressBlock}>
                <Text style={styles.progressLabel}>
                  {goalProgress.toFixed(0)}% do seu objetivo registrado
                </Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${goalProgress}%` }]} />
                </View>
              </View>
            )}
          <Button
            title={
              !activePlan
                ? "Criar meu plano"
                : evaluation?.phase === "DEBT"
                  ? "Revisar minhas dívidas"
                  : "Registrar um aporte realizado"
            }
            onPress={
              !activePlan
                ? () => router.push("/onboarding")
                : evaluation?.phase === "DEBT"
                  ? goPlan
                  : record
            }
          />
        </Card>
        {activePlan && nextDate && (
          <PressFeedback
            accessibilityRole="button"
            accessibilityLabel="Ver próximo aporte planejado"
            onPress={goPlan}
            style={styles.contributionCard}
          >
            <View style={styles.calendarIcon}>
              <Ionicons
                name="calendar-outline"
                size={23}
                color={colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contributionLabel}>Próximo aporte</Text>
              <Text style={styles.contributionDate}>
                {new Date(`${nextDate}T12:00:00`).toLocaleDateString("pt-BR")} ·{" "}
                {
                  {
                    MONTHLY: "todo mês",
                    WEEKLY: "toda semana",
                    FORTNIGHTLY: "a cada 15 dias",
                  }[activePlan.frequency]
                }
              </Text>
            </View>
            <Text style={styles.contributionAmount}>
              {amount(activePlan.contributionAmount)}
            </Text>
            <Ionicons name="chevron-forward" size={17} color={colors.muted} />
          </PressFeedback>
        )}
        {hasAlert && (
          <PressFeedback
            accessibilityRole="button"
            onPress={() => router.push("/(tabs)/rebalance")}
            style={styles.alert}
          >
            <Ionicons
              name="information-circle-outline"
              size={25}
              color={colors.primary}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                Seu plano pode precisar de um ajuste
              </Text>
              <Text style={styles.description}>
                Compare os grupos com suas metas antes de decidir.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </PressFeedback>
        )}
        {Number(strategyPortfolio.totalValue) > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { marginTop: 28, marginBottom: 16 }]}
            >
              Sua carteira de longo prazo
            </Text>
            <Card style={{ alignItems: "center" }}>
              <DonutChart allocations={strategyPortfolio.allocations} />
              <Text style={styles.microcopy}>
                Sua reserva fica separada desta distribuição.
              </Text>
            </Card>
            <Card style={{ marginTop: 12 }}>
              {strategyPortfolio.allocations.map((item) => (
                <View key={item.arcaClass} style={styles.allocation}>
                  <View
                    style={[
                      styles.allocationDot,
                      { backgroundColor: arcaColors[item.arcaClass] },
                    ]}
                  />
                  <Text style={[styles.description, { flex: 1 }]}>
                    {ARCA_LABELS[item.arcaClass]}
                  </Text>
                  <Text style={styles.rowTitle}>
                    {Number(item.percent).toFixed(1)}%
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
        {!!refreshError && (
          <Text accessibilityRole="alert" style={styles.error}>
            {refreshError}
          </Text>
        )}
        <View style={styles.localNote}>
          <Ionicons name="lock-closed-outline" size={13} color={colors.muted} />
          <Text style={styles.localText}>
            Seus registros ficam neste aparelho.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function QuickAction({
  icon,
  title,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  onPress: () => void;
}) {
  return (
    <PressFeedback
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.action}
    >
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={25} color={colors.ink} />
      </View>
      <Text style={styles.actionLabel}>{title}</Text>
    </PressFeedback>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 22,
    paddingTop: 18,
    paddingBottom: layout.tabBottomSpace,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  identity: { flexDirection: "row", gap: 11, alignItems: "center" },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#E3EDE6",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 2,
    color: colors.ink,
  },
  welcome: { fontSize: 12, color: colors.muted, marginTop: 3 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  balanceCard: {
    backgroundColor: colors.primary,
    borderRadius: 30,
    padding: 24,
    overflow: "hidden",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  balanceLabel: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  liveDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#BCE7BD" },
  lightLabel: { fontSize: 13, color: "#DCEBDF", flexShrink: 1 },
  eye: { padding: 4 },
  balance: {
    fontSize: 38,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -1,
    marginTop: 16,
  },
  balanceHint: { fontSize: 12, color: "#C4DACD", marginTop: 7 },
  balanceDivider: {
    height: 1,
    backgroundColor: "#FFFFFF24",
    marginVertical: 23,
  },
  balanceBreakdown: { flexDirection: "row", gap: 14 },
  lightSmall: { fontSize: 11, color: "#BAD6C5" },
  balanceSmall: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 7,
  },
  verticalDivider: { width: 1, backgroundColor: "#FFFFFF24" },
  balanceOrbit: {
    position: "absolute",
    height: 220,
    width: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "#FFFFFF0D",
    right: -100,
    top: -80,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 23,
    marginBottom: 30,
    gap: 6,
  },
  action: { flex: 1, alignItems: "center", gap: 9 },
  actionIcon: {
    height: 58,
    width: 58,
    borderRadius: 22,
    backgroundColor: "#E7EDE9",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
  },
  sectionHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  pill: {
    backgroundColor: "#E2ECE5",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillDot: {
    height: 5,
    width: 5,
    borderRadius: 3,
    backgroundColor: colors.cash,
  },
  pillText: { fontSize: 10, fontWeight: "700", color: colors.primary },
  nextCard: { padding: 22 },
  planHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  planIcon: {
    height: 44,
    width: 44,
    borderRadius: 15,
    backgroundColor: "#EEF4EF",
    alignItems: "center",
    justifyContent: "center",
  },
  nextTitle: {
    flex: 1,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  description: { fontSize: 14, lineHeight: 22, color: colors.muted },
  steps: {
    flexDirection: "row",
    gap: 17,
    marginTop: 19,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  step: { flexDirection: "row", gap: 5, alignItems: "center" },
  stepDot: { height: 6, width: 6, borderRadius: 3, backgroundColor: "#DCE3DD" },
  activeDot: { backgroundColor: colors.primary },
  stepText: { fontSize: 11, color: colors.muted },
  progressBlock: { marginBottom: 20 },
  progressLabel: { fontSize: 12, color: colors.ink, flexShrink: 1 },
  progressPercent: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E6EEE8",
    overflow: "hidden",
    marginTop: 10,
  },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.primary },
  microcopy: {
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 9,
  },
  contributionCard: {
    backgroundColor: "#E9EFEB",
    padding: 17,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 14,
    flexWrap: "wrap",
  },
  calendarIcon: {
    height: 42,
    width: 42,
    borderRadius: 14,
    backgroundColor: "#F9FBF9",
    alignItems: "center",
    justifyContent: "center",
  },
  contributionLabel: { fontSize: 13, color: colors.ink, fontWeight: "700" },
  contributionDate: { fontSize: 10, color: colors.muted, marginTop: 5 },
  contributionAmount: { fontSize: 16, fontWeight: "700", color: colors.ink },
  alert: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 17,
    marginTop: 15,
    borderRadius: 22,
    backgroundColor: "#E4EEE7",
  },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  allocation: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  allocationDot: { width: 8, height: 8, borderRadius: 4 },
  localNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 28,
  },
  localText: { fontSize: 11, color: colors.muted },
  error: { color: colors.danger, lineHeight: 22, marginTop: 15 },
});
