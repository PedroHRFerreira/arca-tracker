import { Text, View } from "react-native";
import { calculateBudget, type PlanningProfile } from "@arca/domain";
import { Card, Button } from "@/components/ui";
import { colors, money } from "@/theme";

export function BudgetCard({
  profile,
  onUseSuggestion,
}: {
  profile: PlanningProfile;
  onUseSuggestion?: (amount: string) => void;
}) {
  const budget = calculateBudget(profile);
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
