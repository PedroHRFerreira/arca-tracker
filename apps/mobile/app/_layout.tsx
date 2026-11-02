import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "@/providers/AppProvider";
import { colors, layout } from "@/theme";
import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { MotionProvider, useReducedMotion } from "@/motion/Motion";
import { AppState, Platform, View } from "react-native";
import { refreshScheduledReminders } from "@/notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  useEffect(() => {
    if (
      Platform.OS !== "web" &&
      Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
    ) {
      import("@/tasks/snapshot")
        .then(({ registerSnapshotTask }) => registerSnapshotTask())
        .catch(console.warn);
    }
  }, []);
  return (
    <SafeAreaProvider>
      <MotionProvider>
        <AppProvider>
          <RemindersSync />
          <StatusBar style="dark" />
          <View style={{ flex: 1, backgroundColor: "#DFE7E1" }}>
            <View
              style={{
                flex: 1,
                width: "100%",
                maxWidth: Platform.OS === "web" ? layout.maxWidth : undefined,
                alignSelf: "center",
                overflow: "hidden",
                backgroundColor: colors.background,
              }}
            >
              <AppStack />
            </View>
          </View>
        </AppProvider>
      </MotionProvider>
    </SafeAreaProvider>
  );
}

function AppStack() {
  const reduced = useReducedMotion();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: reduced ? "none" : "slide_from_right",
        animationDuration: 260,
      }}
    >
      <Stack.Screen
        name="contribution"
        options={{
          presentation: "modal",
          animation: reduced ? "none" : "slide_from_bottom",
        }}
      />
      <Stack.Screen name="settings" options={{ presentation: "card" }} />
    </Stack>
  );
}

function RemindersSync() {
  const { ready, activePlan } = useApp();
  useEffect(() => {
    if (!ready) return;
    const reconcile = () => {
      refreshScheduledReminders(activePlan).catch(console.warn);
    };
    reconcile();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reconcile();
    });
    return () => subscription.remove();
  }, [ready, activePlan]);
  return null;
}
