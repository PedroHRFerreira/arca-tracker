import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useApp } from "@/providers/AppProvider";
import { Button } from "@/components/ui";
import { colors } from "@/theme";

export default function Index() {
  const { ready, onboarded, startupError, refresh } = useApp();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {startupError ? (
          <View style={{ padding: 28, gap: 18 }}>
            <Text
              accessibilityRole="alert"
              style={{ color: colors.ink, fontSize: 17, lineHeight: 26 }}
            >
              {startupError}
            </Text>
            <Button
              title="Tentar abrir novamente"
              onPress={() => {
                refresh().catch(console.warn);
              }}
            />
          </View>
        ) : (
          <ActivityIndicator size="large" color={colors.primary} />
        )}
      </View>
    );
  return <Redirect href={onboarded ? "/(tabs)/dashboard" : "/onboarding"} />;
}
