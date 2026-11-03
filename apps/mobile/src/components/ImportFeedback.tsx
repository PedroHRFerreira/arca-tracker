import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Reveal } from "@/motion/Motion";

export function ImportFeedback({
  error,
  warnings = [],
}: {
  error?: string;
  warnings?: string[];
}) {
  const notices = [...new Set(warnings.filter((warning) => warning.trim()))];
  if (!error && notices.length === 0) return null;

  return (
    <View style={styles.container}>
      {error ? (
        <Reveal style={[styles.box, styles.error]}>
          <View style={styles.heading}>
            <Ionicons
              name="alert-circle-outline"
              size={20}
              color="#991B1B"
              accessible={false}
            />
            <Text style={[styles.title, styles.errorText]}>
              Não foi possível continuar
            </Text>
          </View>
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.body, styles.errorText]}
          >
            {error}
          </Text>
        </Reveal>
      ) : null}
      {notices.length > 0 ? (
        <Reveal style={[styles.box, styles.warning]}>
          <View style={styles.heading}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#805518"
              accessible={false}
            />
            <Text style={[styles.title, styles.warningText]}>
              Antes de salvar, confira
            </Text>
          </View>
          <View accessibilityLiveRegion="polite" style={styles.notices}>
            {notices.map((warning) => (
              <Text key={warning} style={[styles.body, styles.warningText]}>
                {warning}
              </Text>
            ))}
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  box: { borderRadius: 20, padding: 18, gap: 10, borderWidth: 1 },
  error: { backgroundColor: "#FFF1F1", borderColor: "#F4D0D0" },
  warning: { backgroundColor: "#FFF8E9", borderColor: "#EFE1BD" },
  heading: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  body: { fontSize: 13, lineHeight: 21 },
  errorText: { color: "#991B1B" },
  warningText: { color: "#805518" },
  notices: { gap: 9 },
});
