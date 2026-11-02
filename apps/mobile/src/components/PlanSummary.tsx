import { StyleSheet, Text, View } from "react-native";
import {
  allocateContribution,
  ARCA_SHORT_LABELS,
  arcaClasses,
  evaluatePlan,
  nextContributionDate,
  planningHorizonLabel,
  type PlanningProfile,
  type PortfolioSummary,
} from "@arca/domain";
import { BudgetCard } from "@/components/BudgetCard";
import { InvestmentGuidance } from "@/components/InvestmentGuidance";
import { Card } from "@/components/ui";
import { arcaColors, colors, money } from "@/theme";

export const frequencyLabels = {
  MONTHLY: "por mês",
  WEEKLY: "por semana",
  FORTNIGHTLY: "a cada 15 dias",
} as const;
export const strategyLabels = {
  ARCA: "ARCA clássica",
  SIMPLE: "Simples por perfil",
  CUSTOM: "Minha distribuição",
} as const;
export const phaseLabels = {
  DEBT: "Organizar as dívidas",
  RESERVE: "Construir a reserva",
  INVEST: "Investir no objetivo",
} as const;
export const displayPlanDate = (date: string) =>
  date.split("-").reverse().join("/");

export function PlanSummary({
  profile,
  portfolio,
  reserveValue,
  reserveRegistered = false,
  compact = false,
  onUseBudgetSuggestion,
}: {
  profile: PlanningProfile;
  portfolio?: PortfolioSummary;
  reserveValue?: string;
  reserveRegistered?: boolean;
  compact?: boolean;
  onUseBudgetSuggestion?: (amount: string) => void;
}) {
  const evaluation = evaluatePlan(profile, reserveValue);
  const allocation = portfolio
    ? allocateContribution({ profile, portfolio, reserveValue })
    : null;
  const initialAllocation =
    portfolio && Number(profile.initialAmount) > 0
      ? allocateContribution({
          profile,
          portfolio,
          reserveValue,
          amount: profile.initialAmount,
        })
      : null;
  const reserveProgress =
    Number(evaluation.reserveTarget) > 0
      ? Math.min(
          1,
          Number(evaluation.reserveValue) / Number(evaluation.reserveTarget),
        )
      : 0;
  const nextDate = nextContributionDate(
    profile.firstContributionDate,
    profile.frequency,
  );
  return (
    <View style={styles.stack}>
      <Card
        style={{ backgroundColor: colors.primary, borderColor: colors.primary }}
      >
        <Text style={styles.lightEyebrow}>SEU PRÓXIMO PASSO</Text>
        <Text style={styles.heroTitle}>{phaseLabels[evaluation.phase]}</Text>
        <Text style={styles.heroCopy}>{evaluation.explanation}</Text>
        <View style={styles.heroDivider} />
        <Text style={styles.heroAmount}>
          {money(profile.contributionAmount)}
        </Text>
        <Text style={styles.heroCopy}>
          {frequencyLabels[profile.frequency]} · próximo em{" "}
          {displayPlanDate(nextDate)}
        </Text>
        {Number(profile.contributionAmount) === 0 && (
          <Text style={styles.heroCopy}>
            Defina um valor de aporte quando puder para colocar o plano em
            movimento.
          </Text>
        )}
      </Card>
      <Card>
        <Text style={styles.eyebrow}>UMA ETAPA DE CADA VEZ</Text>
        <View style={styles.phases}>
          {(["DEBT", "RESERVE", "INVEST"] as const).map((phase, index) => (
            <View key={phase} style={styles.phase}>
              <View
                style={[
                  styles.phaseNumber,
                  evaluation.phase === phase && styles.phaseSelected,
                ]}
              >
                <Text
                  style={[
                    styles.number,
                    evaluation.phase === phase && { color: "white" },
                  ]}
                >
                  {index + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.phaseText,
                  evaluation.phase === phase && {
                    fontWeight: "800",
                    color: colors.primary,
                  },
                ]}
              >
                {["Dívidas", "Reserva", "Objetivo"][index]}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Reserva para imprevistos</Text>
          <Text style={styles.value}>{profile.reserveMonths} meses</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${reserveProgress * 100}%` }]} />
        </View>
        <Text style={styles.body}>
          {money(evaluation.reserveValue)} de {money(evaluation.reserveTarget)}
        </Text>
        <Text style={styles.small}>
          {reserveRegistered
            ? "Saldo dos ativos marcados como reserva. Substitui o valor declarado, sem somar os dois."
            : "Valor de reserva declarado no planejamento. Ainda não representa ativos cadastrados."}
        </Text>
        {Number(profile.essentialExpenses) === 0 && (
          <Text style={styles.notice}>
            Informe suas despesas essenciais para estabelecer uma meta de
            reserva. A meta atual é zero.
          </Text>
        )}
      </Card>
      {!compact && (
        <>
          <BudgetCard
            profile={profile}
            onUseSuggestion={onUseBudgetSuggestion}
          />
          <InvestmentGuidance profile={profile} reserveValue={reserveValue} />
          <Card>
            <Text style={styles.eyebrow}>SEU OBJETIVO</Text>
            <Text style={styles.title}>{profile.objective}</Text>
            <Text style={styles.body}>
              {money(profile.goalAmount)} · em{" "}
              {planningHorizonLabel(profile.horizonYears)}
            </Text>
            <Text style={styles.small}>
              Uma meta orienta o planejamento; não representa retorno garantido.
            </Text>
          </Card>
          <Card>
            <Text style={styles.eyebrow}>
              {strategyLabels[profile.strategy].toUpperCase()}
            </Text>
            <Text style={styles.title}>Como distribuir o próximo aporte</Text>
            <Text style={styles.body}>
              {allocation
                ? "Os valores respeitam sua etapa atual e priorizam os grupos abaixo da meta na carteira cadastrada."
                : "Percentuais para a etapa de investir no objetivo."}
            </Text>
            {allocation && Number(allocation.debt) > 0 && (
              <View style={styles.allocation}>
                <Text style={styles.label}>Organização das dívidas</Text>
                <Text style={styles.value}>{money(allocation.debt)}</Text>
              </View>
            )}
            {allocation && Number(allocation.reserve) > 0 && (
              <View style={styles.allocation}>
                <Text style={styles.label}>Reserva de emergência</Text>
                <Text style={styles.value}>{money(allocation.reserve)}</Text>
              </View>
            )}
            {arcaClasses
              .filter((key) => Number(evaluation.targets[key]) > 0)
              .map((key) => (
                <View key={key} style={styles.allocation}>
                  <View
                    style={[styles.dot, { backgroundColor: arcaColors[key] }]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>{ARCA_SHORT_LABELS[key]}</Text>
                    <Text style={styles.small}>
                      {evaluation.targets[key]}% da carteira de longo prazo
                    </Text>
                  </View>
                  {allocation && (
                    <Text style={styles.value}>
                      {money(allocation.investments[key])}
                    </Text>
                  )}
                </View>
              ))}
            <Text style={styles.small}>
              A reserva fica separada da carteira de longo prazo. Este é um
              direcionamento para novos aportes; nenhuma compra ou venda será
              realizada.
            </Text>
          </Card>
          {initialAllocation && (
            <Card>
              <Text style={styles.eyebrow}>PARA COMEÇAR AGORA</Text>
              <Text style={styles.title}>
                {money(profile.initialAmount)} disponíveis
              </Text>
              <Text style={styles.body}>
                Uma simulação separada para o valor inicial informado, usando
                sua etapa e carteira atuais.
              </Text>
              {Number(initialAllocation.debt) > 0 && (
                <View style={styles.allocation}>
                  <Text style={styles.label}>Organização das dívidas</Text>
                  <Text style={styles.value}>
                    {money(initialAllocation.debt)}
                  </Text>
                </View>
              )}
              {Number(initialAllocation.reserve) > 0 && (
                <View style={styles.allocation}>
                  <Text style={styles.label}>Reserva de emergência</Text>
                  <Text style={styles.value}>
                    {money(initialAllocation.reserve)}
                  </Text>
                </View>
              )}
              {arcaClasses
                .filter((key) => Number(initialAllocation.investments[key]) > 0)
                .map((key) => (
                  <View key={key} style={styles.allocation}>
                    <Text style={styles.label}>{ARCA_SHORT_LABELS[key]}</Text>
                    <Text style={styles.value}>
                      {money(initialAllocation.investments[key])}
                    </Text>
                  </View>
                ))}
              <Text style={styles.small}>
                Não é somado ao saldo registrado nem ao aporte periódico acima.
                Depois de realizar, registre a movimentação na carteira.
              </Text>
            </Card>
          )}
          <Card>
            <Text style={styles.eyebrow}>PLANEJADO E CADASTRADO</Text>
            <View style={styles.allocation}>
              <Text style={styles.label}>Disponível para começar</Text>
              <Text style={styles.value}>{money(profile.initialAmount)}</Text>
            </View>
            <View style={styles.allocation}>
              <Text style={styles.label}>Investimentos declarados</Text>
              <Text style={styles.value}>
                {money(profile.existingInvestments)}
              </Text>
            </View>
            {portfolio && (
              <View style={styles.allocation}>
                <Text style={styles.label}>Longo prazo cadastrado</Text>
                <Text style={styles.value}>{money(portfolio.totalValue)}</Text>
              </View>
            )}
            <Text style={styles.small}>
              Os valores declarados ajudam a planejar e simular. Somente ativos
              e movimentações registrados compõem o saldo da carteira.
            </Text>
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  lightEyebrow: {
    color: "#C7DEC7",
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 1.3,
  },
  heroTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 9,
  },
  heroCopy: { color: "#E4EDE3", fontSize: 14, lineHeight: 22, marginTop: 6 },
  heroAmount: { color: "#FFFFFF", fontSize: 30, fontWeight: "800" },
  heroDivider: {
    borderTopWidth: 1,
    borderColor: "#4B7461",
    marginVertical: 18,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "800",
  },
  title: { fontSize: 21, fontWeight: "800", color: colors.ink, marginTop: 9 },
  body: { color: colors.muted, lineHeight: 22, fontSize: 14, marginTop: 7 },
  small: { fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 5 },
  notice: { color: "#83551F", fontSize: 13, lineHeight: 20, marginTop: 8 },
  phases: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 22,
  },
  phase: { alignItems: "center", flex: 1, gap: 7 },
  phaseNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#EEF2E9",
    alignItems: "center",
    justifyContent: "center",
  },
  phaseSelected: { backgroundColor: colors.primary },
  number: { color: colors.muted, fontWeight: "800" },
  phaseText: { fontSize: 12, color: colors.muted },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EDF1E9",
    overflow: "hidden",
    marginTop: 12,
  },
  fill: { height: "100%", backgroundColor: colors.cash },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
  },
  allocation: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.ink, fontSize: 14, flexShrink: 1, flexGrow: 1 },
  value: { color: colors.ink, fontWeight: "800", fontSize: 14, flexShrink: 1 },
  dot: { height: 9, width: 9, borderRadius: 5 },
});
