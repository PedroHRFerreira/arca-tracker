import type { PropsWithChildren, ReactNode } from "react";
import {
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { PressFeedback, Reveal } from "@/motion/Motion";
import { colors } from "@/theme";

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <Reveal style={[styles.card, style]}>{children}</Reveal>;
}

export function ScreenHeader({
  title,
  subtitle,
  action,
  back = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  back?: boolean;
}) {
  return (
    <View style={styles.header}>
      {back && (
        <PressFeedback
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() =>
            router.canGoBack()
              ? router.back()
              : router.replace("/(tabs)/dashboard")
          }
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: "#EAF0EC",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </PressFeedback>
      )}
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.eyebrow}>ARCA Tracker</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Button({
  title,
  variant = "primary",
  ...props
}: PressableProps & {
  title: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <PressFeedback
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        props.disabled && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          variant === "secondary" && { color: colors.primary },
        ]}
      >
        {title}
      </Text>
    </PressFeedback>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    marginTop: 5,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  button: {
    backgroundColor: colors.primary,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "#EDF2EF",
    borderWidth: 1,
    borderColor: "#EDF2EF",
  },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
