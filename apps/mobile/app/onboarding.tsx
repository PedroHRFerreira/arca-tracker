import { useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ARCA_SHORT_LABELS, type ArcaClass } from "@arca/domain";
import { Button } from "@/components/ui";
import { saveProjectionSettings, saveTargets, setSetting } from "@/db/database";
import { useApp } from "@/providers/AppProvider";
import { arcaColors, colors } from "@/theme";

const classes: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];
const descriptions: Record<ArcaClass, string> = {
  BRAZIL_STOCKS:
    "Empresas brasileiras para participar do crescimento da economia real.",
  REAL_ESTATE:
    "Fundos imobiliários e ativos ligados a imóveis e geração de renda.",
  CASH_FIXED_INCOME:
    "Reserva, liquidez e renda fixa para estabilidade da estratégia.",
  INTERNATIONAL: "Exposição global por ETFs e BDRs negociados na B3.",
};

export default function Onboarding() {
  const { refresh } = useApp();
  const [step, setStep] = useState(0);
  const [targets, setTargets] = useState<Record<ArcaClass, string>>({
    BRAZIL_STOCKS: "25",
    REAL_ESTATE: "25",
    CASH_FIXED_INCOME: "25",
    INTERNATIONAL: "25",
  });
  const [rate, setRate] = useState("8");
  const [contribution, setContribution] = useState("1000");
  const [offset, setOffset] = useState("3");
  const total = Object.values(targets).reduce(
    (sum, value) => sum + Number(value || 0),
    0,
  );

  async function finish() {
    if (total !== 100) return;
    await saveTargets(targets);
    await saveProjectionSettings({
      annualRate: rate,
      monthlyContribution: contribution,
      offsetPoints: offset,
      horizonYears: 20,
    });
    await setSetting("onboarding_complete", "true");
    await refresh();
    router.replace("/(tabs)/dashboard");
  }

  if (step < 4) {
    const arcaClass = classes[step]!;
    return (
      <SafeAreaView
        style={[styles.slide, { backgroundColor: arcaColors[arcaClass] }]}
      >
        <View style={styles.orbitOne} />
        <View style={styles.orbitTwo} />
        <View style={styles.slideContent}>
          <Text style={styles.brand}>ARCA TRACKER</Text>
          <Text style={styles.counter}>{step + 1} / 4</Text>
          <View style={{ flex: 1, justifyContent: "flex-end" }}>
            <Text style={styles.letter}>{ARCA_SHORT_LABELS[arcaClass][0]}</Text>
            <Text style={styles.slideTitle}>
              {ARCA_SHORT_LABELS[arcaClass]}
            </Text>
            <Text style={styles.slideText}>{descriptions[arcaClass]}</Text>
          </View>
          <Pressable onPress={() => setStep(step + 1)} style={styles.next}>
            <Text style={styles.nextText}>Próximo passo →</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.formPage}>
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.formEyebrow}>CONFIGURAÇÃO INICIAL</Text>
        <Text style={styles.formTitle}>
          {step === 4 ? "Defina suas metas" : "Planeje o futuro"}
        </Text>
        <Text style={styles.formDescription}>
          {step === 4
            ? "Os quatro quadrantes precisam somar exatamente 100%."
            : "Você poderá editar estes parâmetros quando quiser."}
        </Text>
        {step === 4 ? (
          <>
            {classes.map((arcaClass) => (
              <View key={arcaClass} style={styles.fieldRow}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: arcaColors[arcaClass] },
                  ]}
                />
                <Text style={styles.label}>{ARCA_SHORT_LABELS[arcaClass]}</Text>
                <TextInput
                  accessibilityLabel={`Meta de ${ARCA_SHORT_LABELS[arcaClass]}`}
                  keyboardType="decimal-pad"
                  value={targets[arcaClass]}
                  onChangeText={(value) =>
                    setTargets({ ...targets, [arcaClass]: value })
                  }
                  style={styles.percentInput}
                />
                <Text style={styles.suffix}>%</Text>
              </View>
            ))}
            <Text
              style={[styles.total, total !== 100 && { color: colors.danger }]}
            >
              Total: {total}%
            </Text>
            <Button
              title="Continuar"
              disabled={total !== 100}
              onPress={() => setStep(5)}
            />
          </>
        ) : (
          <>
            <Field
              label="Taxa esperada ao ano (%)"
              value={rate}
              onChangeText={setRate}
            />
            <Field
              label="Aporte mensal planejado (R$)"
              value={contribution}
              onChangeText={setContribution}
            />
            <Field
              label="Offset dos cenários (p.p.)"
              value={offset}
              onChangeText={setOffset}
            />
            <Button title="Concluir configuração" onPress={finish} />
            <Pressable onPress={finish}>
              <Text style={styles.skip}>Cadastrar o primeiro ativo depois</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        keyboardType="decimal-pad"
        value={value}
        onChangeText={onChangeText}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, overflow: "hidden" },
  slideContent: { flex: 1, padding: 30, paddingBottom: 24 },
  brand: { color: "#FFF", fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  counter: {
    position: "absolute",
    top: 30,
    right: 30,
    color: "#FFF",
    fontWeight: "700",
  },
  orbitOne: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: 250,
    borderWidth: 1,
    borderColor: "#FFFFFF50",
    right: -260,
    top: 80,
  },
  orbitTwo: {
    position: "absolute",
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "#FFFFFF12",
    left: -100,
    top: 170,
  },
  letter: {
    color: "#FFFFFF25",
    fontSize: 180,
    lineHeight: 180,
    fontWeight: "900",
    position: "absolute",
    bottom: 90,
    right: -5,
  },
  slideTitle: { color: "#FFF", fontWeight: "900", fontSize: 42 },
  slideText: {
    color: "#FFFFFFE8",
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 320,
    marginTop: 12,
  },
  next: {
    backgroundColor: "#111827",
    borderRadius: 14,
    minHeight: 54,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 40,
  },
  nextText: { color: "#FFF", fontWeight: "800" },
  formPage: { flex: 1, backgroundColor: colors.background },
  formContent: { padding: 24, paddingTop: 52 },
  formEyebrow: {
    color: colors.primary,
    fontWeight: "900",
    fontSize: 12,
    letterSpacing: 1,
  },
  formTitle: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.ink,
    marginTop: 6,
  },
  formDescription: {
    color: colors.muted,
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 30,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  label: { flex: 1, color: colors.ink, fontWeight: "700" },
  percentInput: {
    width: 52,
    textAlign: "right",
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
  },
  suffix: { fontWeight: "700", marginLeft: 3 },
  total: {
    textAlign: "right",
    fontWeight: "800",
    color: colors.success,
    marginVertical: 12,
  },
  inputLabel: { color: colors.ink, fontWeight: "700", marginBottom: 8 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    minHeight: 50,
    paddingHorizontal: 14,
    fontSize: 17,
  },
  skip: { textAlign: "center", color: colors.muted, marginTop: 18 },
});
