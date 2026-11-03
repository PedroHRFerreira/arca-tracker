import { useState, type ReactNode } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ARCA_SHORT_LABELS, type ArcaClass } from "@arca/domain";
import { MoneyInput } from "@/components/MoneyInput";
import { Card } from "@/components/ui";
import type { ImportDraftRow } from "@/imports";
import { PressFeedback } from "@/motion/Motion";
import { colors } from "@/theme";

const groups: ArcaClass[] = [
  "BRAZIL_STOCKS",
  "REAL_ESTATE",
  "CASH_FIXED_INCOME",
  "INTERNATIONAL",
];

export function ImportTradeEditor({
  row,
  index,
  included,
  disabled,
  error,
  onChange,
  onToggleIncluded,
}: {
  row: ImportDraftRow;
  index: number;
  included: boolean;
  disabled?: boolean;
  error?: string;
  onChange: (next: ImportDraftRow) => void;
  onToggleIncluded: () => void;
}) {
  const [showSource, setShowSource] = useState(false);
  const update = (patch: Partial<ImportDraftRow>) =>
    onChange({ ...row, ...patch });
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.number}>
          <Text style={styles.numberText}>{index + 1}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {row.symbol || "Confira o investimento"}
          </Text>
          <Text style={styles.help}>
            {included
              ? "Revise com o documento original"
              : "Esta operação não será importada"}
          </Text>
        </View>
        <PressFeedback
          accessibilityRole="checkbox"
          accessibilityState={{ checked: included, disabled }}
          accessibilityLabel={`Incluir operação ${index + 1}`}
          disabled={disabled}
          onPress={onToggleIncluded}
          style={styles.include}
        >
          <Ionicons
            name={included ? "checkbox" : "square-outline"}
            size={27}
            color={included ? colors.primary : colors.muted}
          />
        </PressFeedback>
      </View>
      {included && (
        <>
          <Field label="Código do investimento na B3">
            <TextInput
              accessibilityLabel={`Código da operação ${index + 1}`}
              editable={!disabled}
              style={styles.input}
              value={row.symbol}
              onChangeText={(symbol) =>
                update({ symbol: symbol.toUpperCase() })
              }
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              placeholder="Ex.: PETR4"
              placeholderTextColor={colors.muted}
            />
          </Field>
          <Field label="Nome do investimento">
            <TextInput
              accessibilityLabel={`Nome da operação ${index + 1}`}
              editable={!disabled}
              style={styles.input}
              value={row.name}
              onChangeText={(name) => update({ name })}
              maxLength={160}
              placeholder="Como aparece no comprovante"
              placeholderTextColor={colors.muted}
            />
          </Field>
          <Field label="O que você realizou?">
            <View style={styles.choices}>
              {(
                [
                  ["BUY", "Compra"],
                  ["SELL", "Venda"],
                ] as const
              ).map(([value, label]) => (
                <Choice
                  key={value}
                  label={label}
                  selected={row.type === value}
                  disabled={disabled}
                  onPress={() => update({ type: value })}
                />
              ))}
            </View>
          </Field>
          <Field label="Data da negociação">
            <TextInput
              accessibilityLabel={`Data da operação ${index + 1}`}
              editable={!disabled}
              style={styles.input}
              value={displayDate(row.tradeDate)}
              onChangeText={(tradeDate) =>
                update({ tradeDate: maskDate(tradeDate) })
              }
              keyboardType="number-pad"
              maxLength={10}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.muted}
            />
          </Field>
          <Field label="Quantidade de cotas ou unidades">
            <TextInput
              accessibilityLabel={`Quantidade da operação ${index + 1}`}
              editable={!disabled}
              style={styles.input}
              value={row.quantity.replace(".", ",")}
              onChangeText={(quantity) => update({ quantity })}
              keyboardType="decimal-pad"
              maxLength={32}
              placeholder="Ex.: 10 ou 0,5"
              placeholderTextColor={colors.muted}
            />
          </Field>
          <Field label="Preço por unidade (R$)">
            <ImportMoneyField
              label={`Preço da operação ${index + 1}`}
              value={row.unitPrice}
              disabled={disabled}
              onChange={(unitPrice) => update({ unitPrice })}
            />
          </Field>
          <Field label="Custos desta operação (R$)">
            <ImportMoneyField
              label={`Custos da operação ${index + 1}`}
              value={row.fees}
              disabled={disabled}
              onChange={(fees) =>
                update({ fees, feesConfirmed: fees.trim() !== "" })
              }
            />
            {!row.feesConfirmed && (
              <>
                <Text style={styles.help}>
                  Os custos não foram identificados. Confira as taxas no
                  documento; informe somente a parte desta operação.
                </Text>
                <PressFeedback
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: false, disabled }}
                  accessibilityLabel={`Confirmar que a operação ${index + 1} não teve custos`}
                  disabled={disabled}
                  onPress={() => update({ fees: "0", feesConfirmed: true })}
                  style={styles.checkRow}
                >
                  <Ionicons
                    name="square-outline"
                    size={23}
                    color={colors.primary}
                  />
                  <Text style={styles.checkText}>
                    Conferi: esta operação não teve custos
                  </Text>
                </PressFeedback>
              </>
            )}
          </Field>
          <Field label="Tipo de investimento">
            <View style={styles.choices}>
              {(
                [
                  ["EQUITY", "Ação"],
                  ["ETF", "ETF"],
                  ["FII", "Fundo imobiliário"],
                ] as const
              ).map(([value, label]) => (
                <Choice
                  key={value}
                  label={label}
                  selected={row.assetType === value}
                  disabled={disabled}
                  onPress={() => update({ assetType: value })}
                />
              ))}
            </View>
            <Text style={styles.help}>
              Ações são partes de empresas. ETFs reúnem uma cesta de
              investimentos. FIIs investem no mercado imobiliário.
            </Text>
          </Field>
          <Field label="Grupo na sua carteira">
            <View style={styles.choices}>
              {groups.map((value) => (
                <Choice
                  key={value}
                  label={ARCA_SHORT_LABELS[value]}
                  selected={row.arcaClass === value}
                  disabled={disabled}
                  onPress={() => update({ arcaClass: value })}
                />
              ))}
            </View>
            <Text style={styles.help}>
              Escolha pela exposição do ativo. Um ETF negociado no Brasil pode
              investir em ativos brasileiros ou internacionais. Estes registros
              ficam no seu objetivo, separados da reserva.
            </Text>
          </Field>
          <Field label="Banco ou corretora (opcional)">
            <TextInput
              accessibilityLabel={`Instituição da operação ${index + 1}`}
              editable={!disabled}
              style={styles.input}
              value={row.broker}
              onChangeText={(broker) => update({ broker })}
              maxLength={120}
              placeholder="Instituição onde você negociou"
              placeholderTextColor={colors.muted}
            />
          </Field>
          {!!row.sourceText && (
            <>
              <PressFeedback
                accessibilityRole="button"
                accessibilityState={{ expanded: showSource }}
                onPress={() => setShowSource(!showSource)}
                style={styles.sourceToggle}
              >
                <Text style={styles.sourceLabel}>
                  {showSource
                    ? "Ocultar trecho do documento"
                    : "Comparar com o trecho lido"}
                </Text>
                <Ionicons
                  name={showSource ? "chevron-up" : "chevron-down"}
                  size={17}
                  color={colors.primary}
                />
              </PressFeedback>
              {showSource && (
                <Text selectable style={styles.source}>
                  {row.sourceText}
                </Text>
              )}
            </>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <PressFeedback
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.selected,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.choiceText, selected && { color: "white" }]}>
        {label}
      </Text>
    </PressFeedback>
  );
}

function ImportMoneyField({
  value,
  label,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  // Keep extra precision from a document visible and unchanged; the regular BRL mask uses cents.
  const precise = /[.,]\d{3,}$/.test(value) && !value.includes("R$");
  if (precise)
    return (
      <>
        <TextInput
          accessibilityLabel={label}
          editable={!disabled}
          style={styles.input}
          value={value.replace(".", ",")}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          maxLength={32}
        />
        <Text style={styles.help}>
          O documento informa mais de duas casas decimais. Mantivemos a precisão
          original em reais.
        </Text>
      </>
    );
  return (
    <MoneyInput
      accessibilityLabel={label}
      editable={!disabled}
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder="R$ 0,00"
      placeholderTextColor={colors.muted}
    />
  );
}

export function displayDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split("-").reverse().join("/")
    : value;
}

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length <= 2
    ? digits
    : digits.length <= 4
      ? `${digits.slice(0, 2)}/${digits.slice(2)}`
      : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EAF1EC",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
  title: { color: colors.ink, fontWeight: "800", fontSize: 18 },
  include: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  field: { marginBottom: 18 },
  label: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    minHeight: 50,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  help: { fontSize: 12, lineHeight: 19, color: colors.muted, marginTop: 5 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 13,
    backgroundColor: "#EDF2EF",
  },
  selected: { backgroundColor: colors.primary },
  choiceText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 12,
    minHeight: 44,
  },
  checkText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    lineHeight: 20,
  },
  sourceToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  sourceLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 1,
  },
  source: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 19,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 12,
    marginTop: 5,
  },
  error: { color: colors.danger, lineHeight: 21, fontSize: 14, marginTop: 10 },
});
