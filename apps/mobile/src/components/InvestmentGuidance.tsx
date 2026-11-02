import { Text, View } from "react-native";
import {
  calculateBudget,
  evaluatePlan,
  planningHorizonLabel,
  simpleEquityPercent,
  type PlanningProfile,
} from "@arca/domain";
import { Card } from "@/components/ui";
import { colors, money } from "@/theme";

export function InvestmentGuidance({
  profile,
  reserveValue,
}: {
  profile: PlanningProfile;
  reserveValue?: string;
}) {
  const plan = evaluatePlan(profile, reserveValue);
  const budget = calculateBudget(profile);
  const short =
    profile.horizonYears < 3 ||
    profile.liquidityNeed === "SHORT_TERM" ||
    profile.objective === "Formar uma reserva";
  const equity = simpleEquityPercent(profile);
  const title =
    budget.configured && Number(budget.available) === 0
      ? "Primeiro, abra espaço no orçamento"
      : plan.phase === "DEBT"
        ? "A prioridade agora é reduzir as dívidas caras"
        : plan.phase === "RESERVE"
          ? "Para começar: proteção e facilidade de resgate"
          : short
            ? "Para este prazo, priorize preservar seu dinheiro"
            : "Para o longo prazo, comece com uma carteira simples";
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <Text
          style={{ color: colors.primary, fontSize: 12, fontWeight: "800" }}
        >
          ORIENTAÇÃO PARA O SEU MOMENTO
        </Text>
        <Text style={{ color: colors.ink, fontSize: 21, fontWeight: "800" }}>
          {title}
        </Text>
        <Text style={{ color: colors.muted, lineHeight: 23 }}>
          Seu objetivo: {profile.objective} · prazo de{" "}
          {planningHorizonLabel(profile.horizonYears)}.
        </Text>
        {budget.configured && Number(budget.available) === 0 ? (
          <Text style={{ color: colors.muted, lineHeight: 23 }}>
            Não sugerimos comprometer dinheiro que falta para as suas contas. O
            plano pode continuar com aporte zero e ser revisto quando sua renda
            ou suas despesas mudarem.
          </Text>
        ) : plan.phase === "DEBT" ? (
          <Text style={{ color: colors.muted, lineHeight: 23 }}>
            Separe o valor do plano para negociar ou quitar os juros altos. Sem
            conhecer os contratos, o app não compara o custo exato de cada
            dívida. A escolha de investimentos vem depois desta etapa.
          </Text>
        ) : plan.phase === "RESERVE" ? (
          <Text style={{ color: colors.muted, lineHeight: 23 }}>
            Compare opções de renda fixa com baixo risco e facilidade de
            resgate. O Tesouro Selic é um exemplo para estudar; confira os
            horários de resgate e mantenha acesso ao dinheiro para urgências.
            Ainda faltam {money(plan.reserveGap)} para a reserva que você
            definiu.
          </Text>
        ) : (
          <>
            <Text style={{ color: colors.muted, lineHeight: 23 }}>
              {short
                ? "No modelo Simples por perfil, este prazo ou necessidade de resgate leva a 100% de renda fixa. Ações e fundos imobiliários podem cair justamente quando você precisar do dinheiro."
                : `O modelo Simples por perfil combina ${100 - equity}% de renda fixa com ${equity}% de ETFs amplos, divididos entre Brasil e exterior. A proporção vem do seu prazo e das respostas sobre experiência e perdas.`}
            </Text>
            {profile.strategy !== "SIMPLE" && (
              <Text
                style={{
                  color: short ? colors.danger : colors.ink,
                  lineHeight: 23,
                }}
              >
                {short
                  ? "Sua estratégia atual tem percentuais próprios. Revise a parcela de ativos que oscilam antes de confirmar este objetivo de curto prazo."
                  : "Você escolheu outra estratégia. Os valores do plano respeitam essa escolha; a alternativa simples continua disponível na revisão."}
              </Text>
            )}
          </>
        )}
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>
          A opção mais adequada depende de prazo, liquidez, risco, custos e
          valor disponível. O app não promete retorno nem consegue afirmar qual
          ativo será o mais rentável.
        </Text>
      </View>
    </Card>
  );
}
