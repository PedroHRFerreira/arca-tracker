import { Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { useReducedMotion } from "@/motion/Motion";
import { colors } from "@/theme";

export default function TabsLayout() {
  const reduced = useReducedMotion();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: reduced ? "none" : "fade",
        transitionSpec: {
          animation: "timing",
          config: { duration: reduced ? 0 : 160 },
        },
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: { position: "absolute" },
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Início" }} />
      <Tabs.Screen name="finances" options={{ title: "Finanças" }} />
      <Tabs.Screen name="plan" options={{ title: "Meu plano" }} />
      <Tabs.Screen name="assets" options={{ title: "Carteira" }} />
      <Tabs.Screen name="evolution" options={{ title: "Evolução" }} />
      <Tabs.Screen name="history" options={{ href: null }} />
      <Tabs.Screen name="projection" options={{ href: null }} />
      <Tabs.Screen name="rebalance" options={{ href: null }} />
    </Tabs>
  );
}
