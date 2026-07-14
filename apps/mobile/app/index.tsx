import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useApp } from "@/providers/AppProvider";
import { colors } from "@/theme";

export default function Index() {
  const { ready, onboarded } = useApp();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  return <Redirect href={onboarded ? "/(tabs)/dashboard" : "/onboarding"} />;
}
