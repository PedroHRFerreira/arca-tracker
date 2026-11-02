import { useEffect, useState } from "react";
import { Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScreenHeader } from "@/components/ui";
import { PressFeedback, useContentTransition } from "@/motion/Motion";
import { colors, layout } from "@/theme";
import History from "./history";
import Projection from "./projection";

type EvolutionView = "history" | "projection";
export default function Evolution() {
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<EvolutionView>(
    params.view === "projection" ? "projection" : "history",
  );
  const { transition, transitioning, motionStyle } = useContentTransition();
  useEffect(() => {
    if (params.view === "history" || params.view === "projection")
      setView(params.view);
  }, [params.view]);
  function select(next: EvolutionView) {
    if (view !== next)
      void transition(() => setView(next), next === "projection" ? 1 : -1);
  }
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader
          title="Evolução"
          subtitle="Acompanhe sua caminhada e imagine os próximos passos"
        />
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(
            [
              ["history", "Meu histórico"],
              ["projection", "Simular futuro"],
            ] as const
          ).map(([key, label]) => (
            <PressFeedback
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === key }}
              disabled={transitioning}
              onPress={() => select(key)}
              style={[styles.tab, view === key && styles.selected]}
            >
              <Text style={[styles.label, view === key && styles.activeLabel]}>
                {label}
              </Text>
            </PressFeedback>
          ))}
        </View>
        <Animated.View style={motionStyle}>
          {view === "history" ? <History embedded /> : <Projection embedded />}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 22, paddingBottom: layout.tabBottomSpace },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 5,
    borderRadius: 20,
    backgroundColor: "#E7EEEA",
    marginBottom: 22,
  },
  tab: {
    flex: 1,
    minWidth: 120,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderRadius: 16,
  },
  selected: {
    backgroundColor: "#FFF",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  label: { color: colors.muted, fontWeight: "600", fontSize: 14 },
  activeLabel: { color: colors.primary, fontWeight: "800" },
});
