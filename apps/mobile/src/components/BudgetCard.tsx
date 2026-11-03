import { Text, View } from "react-native";
import { router } from "expo-router";
import { calculateBudget, type PlanningProfile } from "@arca/domain";
import { Card, Button } from "@/components/ui";
import { colors, money } from "@/theme";
import { useControl } from "@/providers/useControl";

export function BudgetCard({
  profile,
  onUseSuggestion,
}: {
  profile: PlanningProfile;
  onUseSuggestion?: (amount: string) => void;
}) {
  const control = useControl();
  const budget = calculateBudget(profile);
  if (!control.ready) return <Card><Text style={{ color: colors.muted }}>Conferindo seu orçamento…</Text></Card>;
  if (control.state.settings.reviewed) {
    const capacity = control.summary.investmentCapacityCents;
    return (
      <Card>
        <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>Um aporte que cabe na sua vida</Text>
        <View style={{ gap: 12, marginTop: 14 }}>
          <Text style={{ color: colors.muted, lineHeight: 23 }}>
            Consideramos seu saldo confirmado, contas ainda não pagas e a margem para imprevistos de {money(control.state.settings.bufferCents / 100)}.
          </Text>
          <Text style={{ color: colors.primary, fontSize: 24, fontWeight: "800" }}>
            {capacity === null ? "Precisamos conferir seus dados" : `${money(capacity / 100)} disponíveis para aportar hoje`}
          </Text>
          {capacity === null ? (
            <View accessibilityRole="alert" style={{ gap: 6 }}>
              {control.summary.gaps.slice(0, 3).map(gap => <Text key={gap} style={{ color: colors.muted, lineHeight: 22 }}>{gap}</Text>)}
              {control.summary.gaps.length > 3 && <Text style={{ color: colors.muted, lineHeight: 22 }}>Veja todas as pendências em Finanças.</Text>}
            </View>
          ) : <Text style={{ color: capacity > 0 ? colors.muted : colors.ink, lineHeight: 23 }}>
            {capacity > 0 ? "Este é o limite calculado para hoje, não uma obrigação de investir. Confira os próximos vencimentos antes de decidir." : "Mantenha os pagamentos em dia. Seu orçamento ainda não permite um novo aporte com a margem escolhida."}
          </Text>}
          <Text style={{ color: colors.ink, lineHeight: 23 }}>
            Desejado: {money(control.summary.desiredContributionCents / 100)} por mês.
            {"\n"}{control.summary.activeContributionCents > 0 ? `Ativo: ${money(control.summary.activeContributionCents / 100)} por mês.` : "Aporte recorrente desativado."}
          </Text>
          <Button title="Revisar meu orçamento e aporte" variant="secondary" onPress={() => router.push("/finance-settings")} />
        </View>
      </Card>
    );
  }
  return (
    <Card>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "800" }}>
        Um aporte que cabe na sua vida
      </Text>
      {!budget.configured ? (
        <Text style={{ color: colors.muted, lineHeight: 23, marginTop: 12 }}>
          Complete sua renda e seus compromissos em Revisar meu plano para
          receber uma sugestão baseada no orçamento.
        </Text>
      ) : (
        <View style={{ gap: 12, marginTop: 14 }}>
          <Text style={{ color: colors.muted, lineHeight: 23 }}>
            Renda líquida: {money(budget.income)}
            {"\n"}Despesas e compromissos: {money(budget.expenses)}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "700" }}>
            Sobra mensal: {money(budget.available)}
          </Text>
          {Number(budget.remaining) <= 0 ? (
            <Text style={{ color: colors.danger, lineHeight: 23 }}>
              Seu orçamento ainda não tem sobra para novos aportes. Comece
              reorganizando as contas; mantenha o aporte em zero até haver
              espaço.
            </Text>
          ) : (
            <>
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 24,
                  fontWeight: "800",
                }}
              >
                {money(budget.suggestedContribution)}{" "}
                {profile.frequency === "MONTHLY"
                  ? "por mês"
                  : profile.frequency === "WEEKLY"
                    ? "por semana"
                    : "a cada 15 dias"}
              </Text>
              <Text style={{ color: colors.muted, lineHeight: 22 }}>
                Ponto de partida do app: separar metade da sobra e deixar a
                outra metade livre. É uma sugestão ajustável, não uma regra
                financeira obrigatória.
              </Text>
              {onUseSuggestion && (
                <Button
                  title="Usar este valor de aporte"
                  variant="secondary"
                  onPress={() => onUseSuggestion(budget.suggestedContribution)}
                />
              )}
            </>
          )}
          {budget.maxOccurrences > 1 && (
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
              Para não apertar seu mês, consideramos até {budget.maxOccurrences}{" "}
              aportes no mesmo mês.
            </Text>
          )}
          <Text style={{ color: colors.muted, lineHeight: 22 }}>
            Seu plano atual separa até {money(budget.plannedMonthly)} por mês.
          </Text>
          {budget.exceedsCapacity && (
            <Text
              accessibilityRole="alert"
              style={{ color: colors.danger, lineHeight: 23 }}
            >
              O aporte escolhido ultrapassa sua sobra mensal. Reduza o valor ou
              revise o orçamento antes de ativar.
            </Text>
          )}
          {profile.hasExpensiveDebt && (
            <Text style={{ color: colors.ink, lineHeight: 22 }}>
              Nesta etapa, o dinheiro separado vai primeiro para organizar as
              dívidas caras.
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}
