import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider } from "@/providers/AppProvider";
import { colors } from "@/theme";
import { useEffect } from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  useEffect(() => {
    if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
      import("@/tasks/snapshot")
        .then(({ registerSnapshotTask }) => registerSnapshotTask())
        .catch(console.warn);
    }
  }, []);
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </AppProvider>
    </SafeAreaProvider>
  );
}
