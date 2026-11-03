import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  getBanksForInvestment,
  type BankCapability,
  type InvestmentCatalogEntry,
} from "@arca/domain";
import {
  getBankOpeningAvailability,
  openBankApp,
  openBankInstructions,
  type BankOpeningResult,
} from "@/banks/openBank";
import { PressFeedback as Pressable } from "@/motion/Motion";
import { displayPlanDate } from "@/components/PlanSummary";
import { colors } from "@/theme";

export function BankActions({ entry }: { entry: InvestmentCatalogEntry }) {
  const banks = getBanksForInvestment(entry.assetType);
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Encontre no seu banco</Text>
      <Text style={styles.copy}>
        {entry.symbol === "TESOURO_SELIC"
          ? "Na área de investimentos, procure por Tesouro Selic. Confira também o vencimento do título."
          : "Na área de investimentos, use este código para buscar o exemplo:"}
      </Text>
      {entry.symbol !== "TESOURO_SELIC" && (
        <Text selectable style={styles.code}>
          {entry.symbol}
        </Text>
      )}
      <Text style={styles.copy}>
        Confirme nome, disponibilidade, preço, quantidade mínima, taxas e
        condições na sua conta antes de decidir. A compra é feita por você no
        banco; o ARCA não envia nem preenche ordens.
      </Text>
      {banks.length ? (
        <>
          <Text style={styles.note}>
            Estes bancos divulgam essa família de investimentos. Isso não
            confirma a oferta deste ativo para sua conta. São exemplos
            verificados, não um catálogo completo nem uma oferta personalizada.
          </Text>
          {banks.map((bank) => (
            <BankAction key={bank.institution} bank={bank} />
          ))}
        </>
      ) : (
        <Text style={styles.note}>
          Ainda não temos instruções verificadas para essa família. Consulte a
          área de investimentos e a ajuda oficial do seu banco.
        </Text>
      )}
    </View>
  );
}

function BankAction({ bank }: { bank: BankCapability }) {
  const availability = getBankOpeningAvailability(bank.institution);
  const [pending, setPending] = useState<"app" | "instructions" | null>(null);
  const [result, setResult] = useState<BankOpeningResult | null>(null);

  async function open(destination: "app" | "instructions") {
    if (pending) return;
    setPending(destination);
    setResult(null);
    try {
      setResult(
        await (destination === "app"
          ? openBankApp(bank.institution)
          : openBankInstructions(bank.institution)),
      );
    } catch {
      setResult({
        status: "failed",
        message:
          destination === "app"
            ? `Não foi possível abrir ${bank.name}. Abra o aplicativo manualmente ou consulte as instruções oficiais abaixo.`
            : "Não foi possível abrir as instruções oficiais. Confira sua conexão ou consulte a ajuda no aplicativo do banco.",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <View style={styles.bank}>
      <Text style={styles.bankName}>{bank.name}</Text>
      <Text style={styles.copy}>{bank.instructions}</Text>
      <Text style={styles.note}>{availability.message}</Text>
      {availability.canOpenApp && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Abrir ${bank.name}`}
          accessibilityHint="Abre o aplicativo do banco para você procurar o investimento."
          accessibilityState={{ disabled: !!pending, busy: pending === "app" }}
          disabled={!!pending}
          onPress={() => void open("app")}
          style={styles.appButton}
        >
          {pending === "app" ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.appButtonText}>Abrir {bank.name}</Text>
          )}
        </Pressable>
      )}
      {availability.instructionsUrl && (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={availability.instructionsLabel}
          accessibilityState={{
            disabled: !!pending,
            busy: pending === "instructions",
          }}
          disabled={!!pending}
          onPress={() => void open("instructions")}
          style={styles.instructionsButton}
        >
          {pending === "instructions" ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.instructionsText}>
              Ver instruções no site oficial ↗
            </Text>
          )}
        </Pressable>
      )}
      {result && (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole={result.status === "failed" ? "alert" : undefined}
          style={[
            styles.status,
            result.status === "failed" && styles.error,
          ]}
        >
          {result.message}
        </Text>
      )}
      <Text style={styles.verified}>
        Família e instruções verificadas em {displayPlanDate(bank.verifiedAt)}.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: 1, borderColor: colors.border, paddingTop: 16, gap: 10 },
  heading: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  code: {
    alignSelf: "flex-start",
    color: colors.primary,
    backgroundColor: "#EDF2E9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  bank: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  bankName: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  appButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  appButtonText: {
    color: colors.surface,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  instructionsButton: {
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  instructionsText: {
    color: colors.primary,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  status: { color: colors.primary, fontSize: 12, lineHeight: 20 },
  error: { color: colors.danger },
  verified: { color: colors.muted, fontSize: 11, lineHeight: 18 },
});
