import { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";
import {
  currencyInputValue,
  formatCurrencyInput,
  parseMoneyInput,
} from "@arca/domain";
import { colors } from "@/theme";

/** Controlled BRL field. Callers receive formatted text; parseMoneyInput normalizes on persistence. */
export function MoneyInput({
  value = "0",
  onChangeText,
  ...props
}: TextInputProps) {
  const [error, setError] = useState("");
  let formatted = value;
  try {
    formatted = formatCurrencyInput(parseMoneyInput(value || "0"));
  } catch {
    /* Keep an existing invalid value visible to its owner. */
  }
  return (
    <View>
      <TextInput
        {...props}
        value={formatted}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={24}
        onChangeText={(raw) => {
          try {
            const amount = currencyInputValue(raw);
            setError("");
            onChangeText?.(formatCurrencyInput(amount));
          } catch {
            setError("Informe um valor em reais sem sinal negativo.");
          }
        }}
      />
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.danger, fontSize: 13, marginTop: 6 }}
        >
          {error}
        </Text>
      )}
    </View>
  );
}
