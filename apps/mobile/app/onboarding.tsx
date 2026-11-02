import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import Decimal from "decimal.js";
import {
  ARCA_SHORT_LABELS,
  arcaClasses,
  defaultPlanningProfile,
  calculateBudget,
  formatCurrencyInput,
  getPlanTargets,
  parseMoneyInput,
  PlanningDraftSchema,
  PlanningProfileSchema,
  simpleEquityPercent,
  type PlanningProfile,
} from "@arca/domain";
import { useContentTransition, PressFeedback } from "@/motion/Motion";
import { MoneyInput } from "@/components/MoneyInput";
import { BudgetCard } from "@/components/BudgetCard";
import { AssetOptions } from "@/components/AssetOptions";
import { PlanSummary } from "@/components/PlanSummary";
import { Button, Card } from "@/components/ui";
import {
  activatePlan,
  getActivePlan,
  getPlanningDraft,
  getSetting,
  savePlanningDraft,
  setSetting,
} from "@/db/database";
import { configureReminders, getReminderPreferences } from "@/notifications";
import { useApp } from "@/providers/AppProvider";
import { arcaColors, colors } from "@/theme";

type MoneyKey =
  | "goalAmount"
  | "initialAmount"
  | "existingInvestments"
  | "contributionAmount"
  | "essentialExpenses"
  | "reserveAmount"
  | "monthlyIncome"
  | "monthlyCommitments";
type InputKey =
  | MoneyKey
  | "objective"
  | "horizonYears"
  | "reserveMonths"
  | "firstContributionDate"
  | `target_${(typeof arcaClasses)[number]}`;
type Fields = Record<InputKey, string>;
const objectivePresets = [
  "Formar uma reserva",
  "Comprar minha casa",
  "Aposentadoria",
  "Construir patrimônio",
  "Gerar renda no futuro",
  "Viagem ou compra importante",
];
const horizonPresets = [3, 6, 12, 24, 36, 60, 120, 240];
const moneyKeys: string[] = [
  "goalAmount",
  "initialAmount",
  "existingInvestments",
  "contributionAmount",
  "essentialExpenses",
  "reserveAmount",
  "monthlyIncome",
  "monthlyCommitments",
];
const titles = [
  "Qual é o seu objetivo?",
  "De onde você está partindo?",
  "Um pouco, com frequência.",
  "Uma base antes de crescer.",
  "Vamos conhecer seu ritmo.",
  "Escolha seu caminho.",
  "Seu plano, com clareza.",
];
const descriptions = [
  "Escolha seu objetivo e em quanto tempo quer chegar lá. Você pode ajustar depois.",
  "Conte o que já tem e quanto pode separar agora. Estes valores servem para planejar.",
  "Aporte é o dinheiro que você separa para seu plano. Escolha um valor que caiba no seu dia a dia.",
  "Organizar dívidas caras e ter uma reserva ajuda a investir com mais tranquilidade.",
  "Não existe resposta certa. Considere como você se sentiria com o dinheiro oscilando.",
  "Compare as estratégias. A etapa financeira vem primeiro, qualquer que seja sua escolha.",
  "Confira seu próximo passo, a distribuição e exemplos para estudar antes de ativar.",
];
const stepFields: InputKey[][] = [
  ["objective", "goalAmount", "horizonYears"],
  ["initialAmount", "existingInvestments"],
  ["contributionAmount", "firstContributionDate"],
  [
    "monthlyIncome",
    "monthlyCommitments",
    "essentialExpenses",
    "reserveAmount",
    "reserveMonths",
  ],
  [],
  [],
  [],
];
function asInput(profile: PlanningProfile): Fields {
  return {
    objective: profile.objective,
    goalAmount: profile.goalAmount.replace(".", ","),
    horizonYears: String(profile.horizonYears).replace(".", ","),
    initialAmount: profile.initialAmount.replace(".", ","),
    existingInvestments: profile.existingInvestments.replace(".", ","),
    contributionAmount: profile.contributionAmount.replace(".", ","),
    firstContributionDate: profile.firstContributionDate
      .split("-")
      .reverse()
      .join("/"),
    essentialExpenses: profile.essentialExpenses.replace(".", ","),
    monthlyIncome: (profile.monthlyIncome ?? "0").replace(".", ","),
    monthlyCommitments: (profile.monthlyCommitments ?? "0").replace(".", ","),
    reserveAmount: profile.reserveAmount.replace(".", ","),
    reserveMonths: String(profile.reserveMonths),
    target_BRAZIL_STOCKS: profile.targets.BRAZIL_STOCKS.replace(".", ","),
    target_REAL_ESTATE: profile.targets.REAL_ESTATE.replace(".", ","),
    target_CASH_FIXED_INCOME: profile.targets.CASH_FIXED_INCOME.replace(
      ".",
      ",",
    ),
    target_INTERNATIONAL: profile.targets.INTERNATIONAL.replace(".", ","),
  };
}

export default function Onboarding() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const {
    refresh,
    strategyPortfolio,
    hasReserveAssets,
    registeredReserveValue,
    activePlan,
  } = useApp();
  const [profile, setProfile] = useState(defaultPlanningProfile);
  const [fields, setFields] = useState<Fields>(() =>
    asInput(defaultPlanningProfile()),
  );
  const [customObjective, setCustomObjective] = useState(false);
  const [customHorizon, setCustomHorizon] = useState(false);
  const [customMonths, setCustomMonths] = useState("120");
  const [step, setStep] = useState(-1);
  const [resumeStep, setResumeStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const { transition, transitioning, motionStyle } = useContentTransition();
  const [saveStatus, setSaveStatus] = useState("");
  const [errors, setErrors] = useState<Partial<Record<InputKey, string>>>({});
  const [message, setMessage] = useState("");
  const scroll = useRef<ScrollView>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  async function load() {
    setMessage("");
    try {
      const draft = await getPlanningDraft();
      const current = await getActivePlan();
      const savedStep = Number((await getSetting("planning_step")) ?? "0");
      const restored = draft ?? current ?? defaultPlanningProfile();
      const restoredStep =
        Number.isInteger(savedStep) && savedStep >= 0 && savedStep <= 6
          ? savedStep
          : 0;
      setCustomObjective(!objectivePresets.includes(restored.objective));
      setCustomHorizon(
        !horizonPresets.includes(Math.round(restored.horizonYears * 12)),
      );
      setCustomMonths(String(Math.round(restored.horizonYears * 12)));
      setProfile(restored);
      setFields(asInput(restored));
      setResumeStep(restoredStep);
      setStep(params.mode === "edit" ? restoredStep : -1);
      setLoaded(true);
    } catch {
      setMessage(
        "Não foi possível abrir seu planejamento. Tente novamente; suas informações continuam no aparelho.",
      );
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!loaded || step < 0 || saving) return;
    const timer = setTimeout(() => {
      const parsed = PlanningDraftSchema.safeParse(profile);
      if (!parsed.success) return;
      setSaveStatus("Salvando no aparelho…");
      writes.current = writes.current
        .catch(() => undefined)
        .then(async () => {
          await savePlanningDraft(parsed.data);
          await setSetting("planning_step", String(Math.max(0, step)));
        });
      void writes.current.then(
        () => setSaveStatus("Salvo neste aparelho"),
        () =>
          setSaveStatus("Não foi possível salvar. Tente continuar novamente."),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [profile, step, loaded, saving]);
  function change(key: InputKey, raw: string) {
    setFields((previous) => ({ ...previous, [key]: raw }));
    let error = "";
    try {
      if (key === "objective") {
        if (!raw.trim() || raw.trim().length > 160)
          throw new Error("Dê um nome ao objetivo, com até 160 caracteres.");
        setProfile((previous) => ({ ...previous, objective: raw.trim() }));
      } else if (key === "firstContributionDate") {
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(raw))
          throw new Error("Use dia/mês/ano. Exemplo: 15/11/2026.");
        const normalized = raw.split("/").reverse().join("-");
        if (
          !PlanningDraftSchema.shape.firstContributionDate.safeParse(normalized)
            .success
        )
          throw new Error("Confira o dia, o mês e o ano informados.");
        setProfile((previous) => ({
          ...previous,
          firstContributionDate: normalized,
        }));
      } else if (key === "horizonYears" || key === "reserveMonths") {
        if (!/^\d+(?:[,.]\d+)?$/.test(raw.trim()))
          throw new Error("Informe um número válido.");
        const value = Number(raw.replace(",", "."));
        if (key === "horizonYears" && (value < 0.1 || value > 100))
          throw new Error("Use um prazo entre 0,1 e 100 anos.");
        if (
          key === "reserveMonths" &&
          (!Number.isInteger(value) || value < 1 || value > 36)
        )
          throw new Error("Escolha de 1 a 36 meses inteiros.");
        setProfile((previous) => ({ ...previous, [key]: value }));
      } else {
        let value: string;
        try {
          value = parseMoneyInput(raw);
        } catch {
          throw new Error(
            "Informe um valor válido, sem sinal negativo e com até dois centavos.",
          );
        }
        if (key.startsWith("target_")) {
          if (Number(value) > 100)
            throw new Error("O percentual deve ficar entre 0 e 100.");
          const arcaClass = key.slice(7) as (typeof arcaClasses)[number];
          setProfile((previous) => ({
            ...previous,
            strategy: "CUSTOM",
            targets: { ...previous.targets, [arcaClass]: value },
          }));
        } else {
          if (key === "essentialExpenses" && Number(value) === 0)
            throw new Error(
              "Informe uma estimativa maior que zero para calcular sua reserva.",
            );
          if (key === "goalAmount" && Number(value) === 0)
            throw new Error(
              "Informe um valor maior que zero para seu objetivo.",
            );
          setProfile((previous) => ({
            ...previous,
            [key]: value,
            ...(key === "monthlyIncome" || key === "monthlyCommitments"
              ? { budgetConfigured: true }
              : {}),
          }));
        }
      }
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Confira este campo.";
    }
    setErrors((previous) => ({ ...previous, [key]: error }));
    setMessage("");
  }
  function useSuggestedAmount(amount: string) {
    setProfile((previous) => ({ ...previous, contributionAmount: amount }));
    setFields((previous) => ({
      ...previous,
      contributionAmount: formatCurrencyInput(amount),
    }));
    setErrors((previous) => ({ ...previous, contributionAmount: "" }));
    setMessage("");
  }
  function chooseObjective(objective: string) {
    setCustomObjective(false);
    setProfile((previous) => ({ ...previous, objective }));
    setFields((previous) => ({ ...previous, objective }));
    setErrors((previous) => ({ ...previous, objective: "" }));
  }
  function chooseHorizon(months: number) {
    setCustomHorizon(false);
    setProfile((previous) => ({ ...previous, horizonYears: months / 12 }));
    setFields((previous) => ({
      ...previous,
      horizonYears: String(months / 12),
    }));
    setErrors((previous) => ({ ...previous, horizonYears: "" }));
  }
  function changeCustomMonths(raw: string) {
    setCustomMonths(raw);
    if (!/^\d+$/.test(raw) || Number(raw) < 2 || Number(raw) > 1200) {
      setErrors((previous) => ({
        ...previous,
        horizonYears: "Informe de 2 a 1.200 meses inteiros.",
      }));
      return;
    }
    setProfile((previous) => ({ ...previous, horizonYears: Number(raw) / 12 }));
    setFields((previous) => ({
      ...previous,
      horizonYears: String(Number(raw) / 12),
    }));
    setErrors((previous) => ({ ...previous, horizonYears: "" }));
  }
  function chooseStrategy(strategy: PlanningProfile["strategy"]) {
    const next = { ...profile, strategy };
    const targets =
      strategy === "CUSTOM"
        ? profile.strategy === "CUSTOM"
          ? profile.targets
          : getPlanTargets(profile)
        : getPlanTargets(next);
    setProfile({ ...next, targets });
    if (strategy !== "CUSTOM" || profile.strategy !== "CUSTOM") {
      setFields((previous) => ({
        ...previous,
        ...Object.fromEntries(
          arcaClasses.map((key) => [
            `target_${key}`,
            targets[key].replace(".", ","),
          ]),
        ),
      }));
      setErrors((previous) => ({
        ...previous,
        ...Object.fromEntries(arcaClasses.map((key) => [`target_${key}`, ""])),
      }));
    }
    setMessage("");
  }
  function validStep() {
    if (step === 0 && Number(profile.goalAmount) <= 0) {
      setMessage("Informe o valor que deseja alcançar.");
      return false;
    }
    if (step === 3 && Number(profile.essentialExpenses) <= 0) {
      setMessage(
        "Estime suas despesas essenciais para definir uma reserva que faça sentido para você.",
      );
      return false;
    }
    if (
      (stepFields[step] ?? []).some((key) => errors[key] || !fields[key].trim())
    ) {
      setMessage("Confira os campos indicados antes de continuar.");
      return false;
    }
    if (
      step === 5 &&
      profile.strategy === "CUSTOM" &&
      (!PlanningProfileSchema.safeParse(profile).success ||
        arcaClasses.some((key) => errors[`target_${key}`]))
    ) {
      setMessage("Revise os percentuais. Eles precisam somar exatamente 100%.");
      return false;
    }
    return true;
  }
  async function advance() {
    if (!validStep()) return;
    setMessage("");
    setSaving(true);
    try {
      await writes.current.catch(() => undefined);
      await savePlanningDraft(profile);
      await setSetting("planning_step", String(step + 1));
      await transition(() => {
        setStep(step + 1);
        scroll.current?.scrollTo({ y: 0, animated: false });
      });
    } catch {
      setMessage(
        "Não foi possível salvar esta etapa. Tente novamente antes de continuar.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function finish() {
    if (calculateBudget(profile).exceedsCapacity) {
      setMessage(
        "O aporte ultrapassa sua sobra mensal. Use a sugestão do orçamento ou reduza o valor antes de ativar.",
      );
      return;
    }
    const parsed = PlanningProfileSchema.safeParse(profile);
    if (!parsed.success || Object.values(errors).some(Boolean)) {
      setMessage(
        "Revise suas respostas e os percentuais antes de ativar o plano.",
      );
      return;
    }
    if (
      Number(profile.goalAmount) <= 0 ||
      Number(profile.essentialExpenses) <= 0
    ) {
      setMessage(
        "Informe o valor do objetivo e suas despesas essenciais nas etapas anteriores.",
      );
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await writes.current.catch(() => undefined);
      await activatePlan(parsed.data);
      await setSetting("planning_step", "0");
      await refresh();
      try {
        await configureReminders(
          await getReminderPreferences(),
          parsed.data,
          false,
        );
      } catch {
        /* The plan remains usable when notifications are unavailable. */
      }
      router.replace("/(tabs)/dashboard");
    } catch {
      setMessage(
        "Não foi possível ativar o plano. Suas respostas foram preservadas. Tente novamente.",
      );
    } finally {
      setSaving(false);
    }
  }
  const field = (key: InputKey, label: string, hint?: string, text = false) => (
    <Field
      key={key}
      label={label}
      hint={hint}
      value={fields[key]}
      onChangeText={(value) => change(key, value)}
      error={errors[key]}
      currency={moneyKeys.includes(key)}
      keyboardType={
        text
          ? "default"
          : key === "firstContributionDate"
            ? "numbers-and-punctuation"
            : "decimal-pad"
      }
    />
  );
  const option = <K extends keyof PlanningProfile>(
    key: K,
    title: string,
    options: Array<{
      value: PlanningProfile[K];
      label: string;
      detail?: string;
    }>,
  ) => (
    <View style={styles.question}>
      <Text style={styles.label}>{title}</Text>
      {options.map((item) => (
        <Choice
          key={String(item.value)}
          label={item.label}
          detail={item.detail}
          selected={profile[key] === item.value}
          onPress={() =>
            setProfile((previous) => ({ ...previous, [key]: item.value }))
          }
        />
      ))}
    </View>
  );
  if (!loaded)
    return (
      <SafeAreaView style={styles.page}>
        <View style={styles.loading}>
          {message ? (
            <>
              <Text style={styles.copy}>{message}</Text>
              <Button title="Tentar novamente" onPress={load} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.copy}>Preparando seu espaço…</Text>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  if (step === -1)
    return (
      <SafeAreaView style={styles.page}>
        <Animated.View style={[{ flex: 1 }, motionStyle]}>
          <ScrollView contentContainerStyle={styles.coverContent}>
            <Text style={styles.brand}>
              ARCA <Text style={{ fontWeight: "400" }}>Tracker</Text>
            </Text>
            <Image
              source={require("../assets/arca-cover.png")}
              style={styles.coverImage}
              resizeMode="contain"
              accessibilityLabel="Uma arca verde sobre águas tranquilas"
            />
            <Text style={styles.eyebrow}>UM COMEÇO QUE CABE NA SUA VIDA</Text>
            <Text style={styles.coverTitle}>
              Seu futuro começa{"\n"}com um plano.
            </Text>
            <Text style={styles.coverDescription}>
              Organize sua base, escolha seu caminho e dê o primeiro passo para
              investir com clareza.
            </Text>
            <View style={styles.coverSteps}>
              {[
                "Conte seu objetivo",
                "Monte seu plano",
                "Acompanhe cada passo",
              ].map((title, index) => (
                <View key={title} style={styles.coverStep}>
                  <Text style={styles.coverNumber}>0{index + 1}</Text>
                  <Text style={styles.coverStepLabel}>{title}</Text>
                </View>
              ))}
            </View>
            <Button
              title={
                resumeStep > 0
                  ? "Continuar meu planejamento"
                  : "Começar meu planejamento"
              }
              disabled={transitioning}
              onPress={() => {
                void transition(() => setStep(resumeStep));
              }}
            />
            <Text style={styles.privacy}>
              7 passos simples · no seu ritmo{"\n"}Suas respostas ficam neste
              aparelho.
            </Text>
            {activePlan && (
              <Button
                title="Voltar ao meu plano atual"
                variant="secondary"
                onPress={() => router.replace("/(tabs)/plan")}
              />
            )}
          </ScrollView>
        </Animated.View>
      </SafeAreaView>
    );
  const reviewReserve = hasReserveAssets
    ? registeredReserveValue
    : profile.reserveAmount;
  return (
    <SafeAreaView style={styles.page}>
      <Animated.View style={[{ flex: 1 }, motionStyle]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            <View style={styles.top}>
              <PressFeedback
                accessibilityRole="button"
                accessibilityLabel="Voltar à etapa anterior"
                disabled={saving || transitioning}
                onPress={() => {
                  setMessage("");
                  if (step === 0) setResumeStep(0);
                  void transition(() => {
                    setStep(step - 1);
                    scroll.current?.scrollTo({ y: 0, animated: false });
                  }, -1);
                }}
                style={styles.back}
              >
                <Text style={styles.backLabel}>← Voltar</Text>
              </PressFeedback>
              <Text style={styles.counter}>PASSO {step + 1} DE 7</Text>
            </View>
            <View
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 7, now: step + 1 }}
              style={styles.progress}
            >
              <View
                style={[
                  styles.progressFill,
                  { width: `${((step + 1) / 7) * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.title}>{titles[step]}</Text>
            <Text style={styles.description}>{descriptions[step]}</Text>
            {params.mode === "edit" && (
              <Text style={styles.editNotice}>
                Seu plano atual só muda quando você confirmar a revisão final.
              </Text>
            )}
            {step === 0 && (
              <Card>
                <View style={styles.question}>
                  <Text style={styles.label}>O que você quer conquistar?</Text>
                  {objectivePresets.map((objective) => (
                    <Choice
                      key={objective}
                      label={objective}
                      selected={
                        !customObjective && profile.objective === objective
                      }
                      onPress={() => chooseObjective(objective)}
                    />
                  ))}
                  <Choice
                    label="Outro objetivo"
                    selected={customObjective}
                    onPress={() => setCustomObjective(true)}
                  />
                  {customObjective &&
                    field(
                      "objective",
                      "Qual é o seu objetivo?",
                      "Escreva um nome para acompanhar seu plano.",
                      true,
                    )}
                </View>
                {field("goalAmount", "Quanto quer alcançar? (R$)")}
                <View style={styles.question}>
                  <Text style={styles.label}>Em quanto tempo?</Text>
                  {horizonPresets.map((months) => (
                    <Choice
                      key={months}
                      label={
                        months <= 36
                          ? `${months} meses`
                          : `${months} meses (${months / 12} anos)`
                      }
                      selected={
                        !customHorizon &&
                        Math.abs(profile.horizonYears * 12 - months) < 0.01
                      }
                      onPress={() => chooseHorizon(months)}
                    />
                  ))}
                  <Choice
                    label="Outro prazo"
                    detail="Escolher uma quantidade de meses."
                    selected={customHorizon}
                    onPress={() => setCustomHorizon(true)}
                  />
                  {customHorizon && (
                    <Field
                      label="Prazo em meses"
                      value={customMonths}
                      onChangeText={changeCustomMonths}
                      error={errors.horizonYears}
                      keyboardType="decimal-pad"
                    />
                  )}
                </View>
              </Card>
            )}
            {step === 1 && (
              <Card>
                {field(
                  "initialAmount",
                  "Quanto pode separar agora? (R$)",
                  "Pode ser zero. Começar pequeno também é começar.",
                )}
                {field(
                  "existingInvestments",
                  "Quanto já tem investido? (R$)",
                  "Informe seus investimentos de longo prazo, sem incluir a reserva.",
                )}
                <Text style={styles.note}>
                  São declarações para planejar e simular. Seu saldo real será
                  formado pelos ativos e movimentações que você cadastrar.
                </Text>
              </Card>
            )}
            {step === 2 && (
              <Card>
                {field(
                  "contributionAmount",
                  "Quanto pretende separar por vez? (R$)",
                  "Pode informar zero e ajustar quando puder.",
                )}
                {option("frequency", "Com que frequência?", [
                  { value: "MONTHLY", label: "Todo mês" },
                  { value: "WEEKLY", label: "Toda semana" },
                  { value: "FORTNIGHTLY", label: "A cada 15 dias" },
                ])}
                {field(
                  "firstContributionDate",
                  "Data do primeiro aporte",
                  "Use DD/MM/AAAA. Ex.: 15/11/2026.",
                )}
                <Text style={styles.note}>
                  Em meses sem o dia escolhido, usamos o último dia do mês. O
                  lembrete pode ser ativado em Ajustes.
                </Text>
              </Card>
            )}
            {step === 3 && (
              <Card>
                {field(
                  "monthlyIncome",
                  "Sua renda líquida por mês (R$)",
                  "Quanto entra depois dos descontos. Se a renda variar, use uma estimativa cautelosa.",
                )}
                {field(
                  "essentialExpenses",
                  "Suas despesas essenciais por mês (R$)",
                  "Moradia, alimentação, transporte e outras contas indispensáveis.",
                )}
                {field(
                  "monthlyCommitments",
                  "Outros gastos e compromissos por mês (R$)",
                  "Inclua parcelas, lazer e outros gastos. Não repita as despesas essenciais acima.",
                )}
                {option("incomeStability", "Como é sua renda?", [
                  { value: "STABLE", label: "Regular e previsível" },
                  { value: "VARIABLE", label: "Varia a cada mês" },
                  { value: "UNKNOWN", label: "Ainda não sei dizer" },
                ])}
                {option("hasExpensiveDebt", "Tem dívidas com juros altos?", [
                  {
                    value: true,
                    label: "Sim",
                    detail:
                      "Como rotativo do cartão, cheque especial ou crédito caro.",
                  },
                  { value: false, label: "Não tenho ou já resolvi" },
                ])}
                {field(
                  "reserveAmount",
                  "Quanto já tem para emergências? (R$)",
                  "Dinheiro reservado para imprevistos, separado dos investimentos do objetivo.",
                )}
                {hasReserveAssets && (
                  <Text style={styles.note}>
                    Você já cadastrou ativos como reserva. No plano, o saldo
                    desses ativos substitui esta declaração, sem somar os dois.
                  </Text>
                )}
                {field(
                  "reserveMonths",
                  "Quantos meses sua reserva deve cobrir?",
                  "Começamos com 6 meses como ponto de partida. Ajuste de 1 a 36 conforme sua realidade.",
                )}
                <Text style={styles.note}>
                  A sequência é: dívidas caras → reserva → objetivo. Sem os
                  contratos da dívida, não calculamos sua amortização.
                </Text>
              </Card>
            )}
            {step === 3 && (
              <BudgetCard
                profile={profile}
                onUseSuggestion={useSuggestedAmount}
              />
            )}
            {step === 4 && (
              <Card>
                {option("experience", "Você já investiu antes?", [
                  { value: "BEGINNER", label: "Estou começando" },
                  { value: "SOME", label: "Já conheço algumas opções" },
                  {
                    value: "EXPERIENCED",
                    label: "Tenho experiência com oscilações",
                  },
                  { value: "UNKNOWN", label: "Prefiro não responder" },
                ])}
                {option(
                  "liquidityNeed",
                  "Pode precisar deste dinheiro em breve?",
                  [
                    { value: "SHORT_TERM", label: "Sim, nos próximos anos" },
                    {
                      value: "LONG_TERM",
                      label: "Posso deixar para o longo prazo",
                    },
                    { value: "UNKNOWN", label: "Ainda não sei" },
                  ],
                )}
                {option("lossReaction", "Se o valor investido caísse, você…", [
                  {
                    value: "SELL",
                    label: "Preferiria vender para evitar mais perdas",
                  },
                  { value: "WAIT", label: "Esperaria, revendo o plano" },
                  {
                    value: "BUY_MORE",
                    label: "Consideraria investir mais",
                    detail: "Sabendo que a queda pode continuar.",
                  },
                  { value: "UNKNOWN", label: "Ainda não sei como reagiria" },
                ])}
                <Text style={styles.note}>
                  Essas respostas orientam um modelo educativo do app. Não são
                  uma avaliação oficial de perfil de investidor.
                </Text>
              </Card>
            )}
            {step === 5 && (
              <>
                <Choice
                  selected={profile.strategy === "ARCA"}
                  label="ARCA clássica"
                  tag="4 grupos · 25% cada"
                  detail="Ações brasileiras, imóveis, renda fixa e internacional. Uma forma de organizar e diversificar a carteira de longo prazo."
                  onPress={() => chooseStrategy("ARCA")}
                />
                <Choice
                  selected={profile.strategy === "SIMPLE"}
                  label="Simples por perfil"
                  tag={`${100 - simpleEquityPercent(profile)}% renda fixa · ${simpleEquityPercent(profile)}% ETFs`}
                  detail="Renda fixa e fundos de índice amplos. A parcela de ações considera seu prazo e suas respostas."
                  onPress={() => chooseStrategy("SIMPLE")}
                />
                <Choice
                  selected={profile.strategy === "CUSTOM"}
                  label="Minha distribuição"
                  tag="Você define os percentuais"
                  detail="Edite os quatro grupos de acordo com seu planejamento. Eles precisam somar 100%."
                  onPress={() => chooseStrategy("CUSTOM")}
                />
                <Card>
                  <Text style={styles.label}>
                    Como o modelo simples é escolhido
                  </Text>
                  <Text style={styles.copy}>
                    Menos de 3 anos ou necessidade de resgate em breve: 100%
                    renda fixa. De 3 a 5 anos: 80% renda fixa e 20% ETFs.
                  </Text>
                  <Text style={styles.copy}>
                    Acima de 5 anos: respostas desconhecidas ou preferência por
                    vender em quedas levam a 80/20. Experiência com oscilações e
                    disposição para investir mais em quedas levam a 40/60. Nos
                    demais casos, usamos 60/40.
                  </Text>
                  <Text style={styles.copy}>
                    Os ETFs são divididos entre Brasil e exterior. Estes
                    percentuais são padrões educativos do ARCA Tracker; não são
                    regras da CVM.
                  </Text>
                  <Text style={styles.copy}>
                    ARCA é uma metodologia de distribuição. Este aplicativo não
                    é o fundo comercial ARCA e não aplica dinheiro nele.
                  </Text>
                </Card>
                {profile.strategy === "CUSTOM" && (
                  <Card>
                    {arcaClasses.map((key) => (
                      <View key={key}>
                        <View style={styles.targetHeading}>
                          <View
                            style={[
                              styles.dot,
                              { backgroundColor: arcaColors[key] },
                            ]}
                          />
                          <Text style={styles.label}>
                            {ARCA_SHORT_LABELS[key]}
                          </Text>
                        </View>
                        {field(`target_${key}`, "Percentual (%)")}
                      </View>
                    ))}
                    <Text
                      style={[
                        styles.total,
                        !Object.values(profile.targets)
                          .reduce(
                            (sum, value) => sum.plus(value),
                            new Decimal(0),
                          )
                          .eq(100) && { color: colors.danger },
                      ]}
                    >
                      Soma dos valores válidos:{" "}
                      {Object.values(profile.targets)
                        .reduce((sum, value) => sum.plus(value), new Decimal(0))
                        .toString()}
                      %
                    </Text>
                  </Card>
                )}
                {profile.strategy === "ARCA" &&
                  (profile.horizonYears < 3 ||
                    profile.liquidityNeed === "SHORT_TERM" ||
                    profile.lossReaction === "SELL") && (
                    <Text style={styles.editNotice}>
                      A ARCA contém renda variável, que pode cair e não combina
                      com todo prazo ou tolerância a perdas. Pelas suas
                      respostas, compare com a opção simples antes de escolher.
                    </Text>
                  )}
              </>
            )}
            {step === 6 && (
              <>
                <PlanSummary
                  onUseBudgetSuggestion={useSuggestedAmount}
                  profile={profile}
                  portfolio={strategyPortfolio}
                  reserveValue={reviewReserve}
                  reserveRegistered={hasReserveAssets}
                />
                <AssetOptions
                  profile={profile}
                  reserveValue={reviewReserve}
                  portfolio={strategyPortfolio}
                  strategy={profile.strategy}
                  targets={getPlanTargets(profile)}
                />
                <Card>
                  <Text style={styles.label}>Você mantém o controle</Text>
                  <Text style={styles.copy}>
                    Ao ativar, você confirma que revisou suas respostas, os
                    critérios e a distribuição. Nenhuma transação será criada.
                    Seus ativos atuais serão preservados e você poderá editar o
                    plano depois.
                  </Text>
                </Card>
              </>
            )}
            {!!message && (
              <Text accessibilityRole="alert" style={styles.errorBox}>
                {message}
              </Text>
            )}
            <View style={styles.footer}>
              <Button
                title={
                  saving
                    ? step === 6
                      ? "Ativando…"
                      : "Salvando…"
                    : step === 6
                      ? activePlan
                        ? "Confirmar alterações do plano"
                        : "Revisar e ativar meu plano"
                      : step === 5
                        ? "Revisar meu plano"
                        : "Continuar →"
                }
                disabled={saving || transitioning}
                onPress={step === 6 ? finish : advance}
              />
              <Text accessibilityLiveRegion="polite" style={styles.saved}>
                {saveStatus}
              </Text>
              {activePlan && (
                <PressFeedback
                  accessibilityRole="button"
                  disabled={saving || transitioning}
                  onPress={() => router.replace("/(tabs)/plan")}
                  style={styles.exit}
                >
                  <Text style={styles.backLabel}>
                    Sair e manter o plano atual
                  </Text>
                </PressFeedback>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>
    </SafeAreaView>
  );
}
function Field({
  label,
  hint,
  value,
  onChangeText,
  error,
  keyboardType,
  currency = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  currency?: boolean;
  keyboardType?: "default" | "decimal-pad" | "numbers-and-punctuation";
}) {
  const Input = currency ? MoneyInput : TextInput;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <Input
        accessibilityLabel={label}
        accessibilityHint={hint}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={[styles.input, !!error && { borderColor: colors.danger }]}
        placeholderTextColor={colors.muted}
        maxLength={keyboardType === "default" ? 160 : 22}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={styles.fieldError}>
          {error}
        </Text>
      )}
    </View>
  );
}
function Choice({
  label,
  detail,
  tag,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  tag?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <PressFeedback
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.selected]}
    >
      <View style={styles.choiceHeading}>
        <Text style={styles.choiceLabel}>{label}</Text>
        <View
          style={[styles.radio, selected && { borderColor: colors.primary }]}
        >
          {selected && <View style={styles.radioCenter} />}
        </View>
      </View>
      {tag && <Text style={styles.choiceTag}>{tag}</Text>}
      {detail && <Text style={styles.choiceDetail}>{detail}</Text>}
    </PressFeedback>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: "center", padding: 28, gap: 20 },
  content: {
    padding: 22,
    paddingBottom: 38,
    gap: 16,
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  back: { minHeight: 44, justifyContent: "center", paddingRight: 18 },
  backLabel: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  counter: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 1,
    fontWeight: "800",
  },
  progress: {
    backgroundColor: "#E1E8DC",
    height: 5,
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressFill: { backgroundColor: colors.primary, height: "100%" },
  title: { fontSize: 31, lineHeight: 38, fontWeight: "800", color: colors.ink },
  description: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 8,
  },
  field: { marginBottom: 22, gap: 7 },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 20 },
  input: {
    minHeight: 52,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 17,
    color: colors.ink,
  },
  copy: { fontSize: 13, color: colors.muted, lineHeight: 22, marginTop: 8 },
  note: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 21,
    backgroundColor: "#F0F4EA",
    padding: 13,
    borderRadius: 10,
  },
  question: { gap: 9, marginBottom: 24 },
  choice: {
    padding: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 14,
    minHeight: 58,
  },
  selected: { borderColor: colors.primary, backgroundColor: "#ECF2E8" },
  choiceHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  choiceLabel: {
    flex: 1,
    fontWeight: "700",
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
  },
  choiceDetail: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 6,
  },
  choiceTag: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12,
    marginTop: 8,
  },
  radio: {
    borderWidth: 1.5,
    borderColor: "#A6B6A8",
    height: 21,
    width: 21,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCenter: {
    backgroundColor: colors.primary,
    height: 11,
    width: 11,
    borderRadius: 6,
  },
  fieldError: { color: colors.danger, fontSize: 12, lineHeight: 19 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 14,
    color: colors.danger,
    lineHeight: 21,
  },
  editNotice: {
    backgroundColor: "#F6EEDB",
    color: "#72551E",
    padding: 14,
    fontSize: 12,
    lineHeight: 21,
    borderRadius: 12,
  },
  footer: { marginTop: 10, gap: 10 },
  saved: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
  },
  exit: { alignItems: "center", padding: 14 },
  targetHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  dot: { height: 9, width: 9, borderRadius: 5 },
  total: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: "800",
    textAlign: "right",
  },
  coverContent: {
    padding: 26,
    paddingBottom: 36,
    maxWidth: 600,
    width: "100%",
    alignSelf: "center",
  },
  brand: {
    fontSize: 21,
    letterSpacing: 2,
    fontWeight: "900",
    color: colors.primary,
    textAlign: "center",
    marginTop: 12,
  },
  coverImage: {
    width: "100%",
    aspectRatio: 1.5,
    maxHeight: 250,
    marginVertical: 15,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: "800",
  },
  coverTitle: {
    color: colors.ink,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: -0.8,
    fontWeight: "800",
    marginTop: 11,
  },
  coverDescription: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 25,
    marginTop: 14,
  },
  coverSteps: { gap: 14, marginVertical: 27 },
  coverStep: { flexDirection: "row", alignItems: "center", gap: 14 },
  coverNumber: {
    color: colors.primary,
    backgroundColor: "#E8EEDC",
    borderRadius: 9,
    padding: 8,
    fontSize: 11,
    fontWeight: "800",
  },
  coverStepLabel: { color: colors.ink, fontSize: 14 },
  privacy: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 20,
    textAlign: "center",
    marginVertical: 16,
  },
});
