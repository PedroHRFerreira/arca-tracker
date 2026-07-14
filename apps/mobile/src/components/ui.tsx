import type { PropsWithChildren, ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import { colors } from "@/theme";

export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View>
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
    <Pressable
      accessibilityRole="button"
      {...props}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
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
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#0F172A",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: { color: colors.ink, fontSize: 27, fontWeight: "800", marginTop: 2 },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 4 },
  button: {
    backgroundColor: colors.primary,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "#EEF3FF",
    borderWidth: 1,
    borderColor: "#C7D7FE",
  },
  danger: { backgroundColor: colors.danger },
  buttonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 15 },
});
