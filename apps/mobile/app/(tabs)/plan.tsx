import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { evaluatePlan, getPlanTargets } from "@arca/domain";
import { AssetOptions } from "@/components/AssetOptions";
import { PlanSummary } from "@/components/PlanSummary";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { activatePlan, setSetting } from "@/db/database";
import { configureReminders, getReminderPreferences } from "@/notifications";
import { useApp } from "@/providers/AppProvider";
import { colors, layout } from "@/theme";

export default function PlanScreen() {
  const {
    activePlan,
    strategyPortfolio,
    reserveValue,
    hasReserveAssets,
    refresh,
  } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function resolveDebt() {
    if (!activePlan) return;
    setSaving(true);
    setError("");
    try {
      const updated = { ...activePlan, hasExpensiveDebt: false };
      await activatePlan(updated);
      await setSetting("planning_step", "0");
      await refresh();
      try {
        await configureReminders(
          await getReminderPreferences(),
          updated,
          false,
        );
      } catch {
        /* Planning works without notifications. */
      }
      setConfirming(false);
    } catch {
      setError("Não foi possível atualizar o plano. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <SafeAreaView style={styles.page} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Meu plano"
          subtitle="Seu caminho, uma etapa de cada vez."
        />
        {!activePlan ? (
          <Card>
            <Text style={styles.title}>Vamos dar sentido à sua carteira?</Text>
            <Text style={styles.copy}>
              Defina um objetivo, organize a reserva e escolha uma estratégia.
              Seus ativos atuais serão preservados.
            </Text>
            <Button
              title="Criar meu planejamento"
              onPress={() => router.push("/onboarding")}
            />
          </Card>
        ) : (
          <>
            <PlanSummary
              profile={activePlan}
              portfolio={strategyPortfolio}
              reserveValue={reserveValue}
              reserveRegistered={hasReserveAssets}
            />
            {evaluatePlan(activePlan, reserveValue).phase === "DEBT" && (
              <Card>
                <Text style={styles.title}>
                  Conseguiu resolver as dívidas caras?
                </Text>
                <Text style={styles.copy}>
                  Você confirma esta etapa manualmente. O aplicativo não acessa
                  seus contratos nem realiza pagamentos.
                </Text>
                {confirming ? (
                  <View style={styles.stack}>
                    <Text style={styles.confirmation}>
                      Confirme somente se as dívidas com juros altos foram
                      resolvidas. O plano passará a priorizar sua reserva ou seu
                      objetivo.
                    </Text>
                    <Button
                      title={
                        saving
                          ? "Atualizando…"
                          : "Confirmo que resolvi as dívidas caras"
                      }
                      disabled={saving}
                      onPress={resolveDebt}
                    />
                    <Button
                      title="Ainda não, voltar"
                      variant="secondary"
                      disabled={saving}
                      onPress={() => setConfirming(false)}
                    />
                  </View>
                ) : (
                  <Button
                    title="Já resolvi minhas dívidas caras"
                    variant="secondary"
                    onPress={() => setConfirming(true)}
                  />
                )}
              </Card>
            )}
            {!!error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}
            <Button
              title="Revisar minhas respostas e estratégia"
              onPress={() => router.push("/onboarding?mode=edit")}
            />
            <AssetOptions
              profile={activePlan}
              reserveValue={reserveValue}
              portfolio={strategyPortfolio}
              strategy={activePlan.strategy}
              targets={getPlanTargets(activePlan)}
            />
            <Card>
              <Text style={styles.title}>Ajustes da carteira</Text>
              <Text style={styles.copy}>
                Compare sua distribuição atual com o plano e simule ajustes,
                incluindo eventuais vendas. Nenhuma operação é enviada à
                corretora.
              </Text>
              <Button
                title="Simular ajuste da carteira"
                variant="secondary"
                onPress={() => router.push("/(tabs)/rebalance")}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: 20,
    gap: 17,
    paddingBottom: layout.tabBottomSpace,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 27 },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 23,
    marginTop: 9,
    marginBottom: 18,
  },
  stack: { gap: 12 },
  confirmation: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 22,
    padding: 12,
    backgroundColor: "#EDF2E9",
    borderRadius: 10,
  },
  error: { color: colors.danger, lineHeight: 22, padding: 12 },
});
