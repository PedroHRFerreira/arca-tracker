import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/theme";

const icons = {
  dashboard: "grid-outline",
  assets: "wallet-outline",
  history: "analytics-outline",
  projection: "trending-up-outline",
  rebalance: "swap-horizontal-outline",
} as const;
const labels = {
  dashboard: "Dashboard",
  assets: "Ativos",
  history: "Histórico",
  projection: "Projeção",
  rebalance: "Rebalancear",
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          height: 68,
          paddingTop: 7,
          paddingBottom: 8,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarIcon: ({ color, size }) => (
          <Ionicons
            name={icons[route.name as keyof typeof icons] ?? "ellipse-outline"}
            size={size}
            color={color}
          />
        ),
      })}
    >
      {Object.entries(labels).map(([name, title]) => (
        <Tabs.Screen key={name} name={name} options={{ title }} />
      ))}
    </Tabs>
  );
}
