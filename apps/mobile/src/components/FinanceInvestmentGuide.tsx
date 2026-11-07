import { useState } from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { getPlanTargets, type ControlState, type ControlSummary } from '@arca/domain';
import { useApp } from '@/providers/AppProvider';
import { investmentBudget } from '@/financeGuidance';
import { AssetOptions } from '@/components/AssetOptions';
import { Button, Card } from '@/components/ui';
import { controlMoney } from '@/components/ControlUI';
import { colors } from '@/theme';
import { PressFeedback } from '@/motion/Motion';

export function FinanceInvestmentGuide({ state, summary, onReview, conflict = false }: { state: ControlState; summary: ControlSummary; onReview: () => void; conflict?: boolean }) {
  const { activePlan, strategyPortfolio } = useApp();
  const [showBudget, setShowBudget] = useState(false);
  if (conflict) return <Card style={styles.card}><Text style={styles.title}>Confirme a versão dos seus dados</Text><Text style={styles.copy}>Há diferenças entre este aparelho e a base online. Resolva essa revisão antes de usar um valor como referência para investir.</Text><Button title="Comparar versões dos meus dados" onPress={() => router.push('/finance-settings')} /></Card>;
  const profile = activePlan ? { ...activePlan, essentialExpenses: (summary.essentialExpensesCents / 100).toFixed(2), reserveMonths: state.settings.reserveMonths } : null;
  const budget = investmentBudget(summary, profile);
  const blocked = {
    REVIEW: { title: 'Primeiro, confirme o que sobra', detail: 'Há informações do orçamento por conferir. Escolher um ativo agora não resolve essa dúvida; vamos começar pelos saldos e compromissos.', label: 'Conferir meu orçamento', onPress: onReview },
    WAIT: { title: 'Seu aporte pode esperar', detail: 'Hoje não há capacidade confirmada para um novo investimento. Mantenha os pagamentos em dia e reveja o orçamento antes de separar um valor.', label: 'Revisar meu orçamento', onPress: onReview },
    PROFILE: { title: 'Vamos descobrir o que faz sentido para você', detail: 'O prazo do objetivo e sua reação a perdas ajudam a escolher a distribuição. Responda o planejamento para receber opções com esses critérios.', label: 'Responder meu planejamento', onPress: () => router.push('/onboarding') },
    DEBT: { title: 'Organize primeiro os juros altos', detail: 'Seu plano informa dívidas caras. Confira essa etapa antes de fazer um novo aporte. Parcelas em dia, por si só, não são dívidas caras.', label: 'Revisar etapa do meu plano', onPress: () => router.push('/(tabs)/plan') },
    HORIZON: { title: 'Ajuste a estratégia ao seu prazo', detail: 'Seu objetivo tem prazo curto ou exige acesso ao dinheiro, mas a distribuição escolhida inclui ativos que podem cair. Revise essa escolha antes de comparar compras.', label: 'Revisar prazo e estratégia', onPress: () => router.push('/onboarding?mode=edit') },
  };
  if (budget.stage in blocked) {
    const message = blocked[budget.stage as keyof typeof blocked];
    return <Card style={styles.card}><Text style={styles.title}>{message.title}</Text><Text style={styles.copy}>{message.detail}</Text><Button title={message.label} onPress={message.onPress} /></Card>;
  }
  if (!profile) return null;
  const reserve = budget.stage === 'RESERVE';
  return <View style={{ gap: 16 }}>
    <Card style={styles.card}>
      <Text style={styles.title}>{reserve ? 'Comece pela segurança do dia a dia' : 'Diversifique conforme o seu plano'}</Text>
      <Text style={styles.amount}>Até {controlMoney(budget.amountCents)}</Text>
      <Text style={styles.copy}>{reserve ? `Faltam ${controlMoney(summary.reserveRemainingCents)} para sua reserva. Compare renda fixa com baixo risco e facilidade de resgate.` : `Objetivo de ${profile.horizonYears < 1 ? `${Math.round(profile.horizonYears * 12)} meses` : `${profile.horizonYears} anos`}. As opções seguem os grupos da estratégia que você revisou.`}</Text>
      <PressFeedback accessibilityRole="button" accessibilityState={{ expanded: showBudget }} onPress={() => setShowBudget(!showBudget)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={styles.budgetLink}>{showBudget ? 'Recolher cálculo' : 'Como chegamos a esse valor?'}</Text></PressFeedback>
      {showBudget && <View style={{ gap: 10 }}><Text style={styles.copy}>Capacidade confirmada hoje: {controlMoney(summary.investmentCapacityCents!)}.</Text><Text style={styles.copy}>Aporte desejado: {controlMoney(summary.desiredContributionCents)}.</Text><Text style={styles.copy}>Usamos o menor valor entre capacidade e meta de aporte. Quando a meta é zero, usamos a capacidade apenas como referência. Na reserva, limitamos também ao que falta para completar a etapa. Nenhuma compra é feita automaticamente.</Text></View>}
    </Card>
    <AssetOptions profile={profile} portfolio={strategyPortfolio} reserveValue={(summary.reserveCents / 100).toFixed(2)} strategy={profile.strategy} targets={getPlanTargets(profile)} amount={(budget.amountCents / 100).toFixed(2)} explain focus={reserve ? 'RESERVE' : 'LONG_TERM'} />
    <Card style={styles.card}><Text style={styles.title}>Como dar o próximo passo</Text><Text style={styles.copy}>1. Abra uma opção e confira motivo, riscos, resgate e custos.</Text><Text style={styles.copy}>2. Compare as condições na sua instituição. Confira preço e valor mínimo antes de comprar.</Text><Text style={styles.copy}>3. Depois de realizar a compra, registre o aporte ou importe o comprovante no ARCA.</Text><Button title="Registrar uma compra que já fiz" variant="secondary" onPress={() => router.push(reserve ? '/contribution?bucket=RESERVE' : '/contribution')} /></Card>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 12, gap: 10, padding: 18, borderColor: colors.border },
  title: { fontSize: 21, lineHeight: 28, fontWeight: '800', color: colors.ink },
  amount: { fontSize: 29, fontWeight: '800', color: colors.primary },
  budgetLink: { fontSize: 13, fontWeight: '700', color: colors.primary },
  copy: { fontSize: 14, lineHeight: 22, color: colors.muted },
});
