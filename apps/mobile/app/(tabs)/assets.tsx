import { PressFeedback as Pressable } from "@/motion/Motion";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { useApp } from "@/providers/AppProvider";
import { arcaColors, colors, money, layout } from "@/theme";

export default function Assets() {
  const { assets, strategyPortfolio, registeredReserveValue } = useApp();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Sua carteira"
          subtitle="Os investimentos que você já realizou"
        />
        <Card>
          <Text style={styles.infoTitle}>Planejar é diferente de investir</Text>
          <Text style={styles.text}>
            Depois de comprar na sua instituição financeira, importe o
            comprovante ou registre a movimentação para acompanhar os valores.
          </Text>
        </Card>
        {!assets.length && (
          <Card style={{ marginTop: 18 }}>
            <Text style={styles.heading}>
              Seu primeiro investimento começa com um plano
            </Text>
            <Text style={styles.text}>
              Sua carteira ainda está vazia. Você pode criar seu plano e
              registrar os investimentos quando estiver pronto.
            </Text>
            <View style={{ height: 16 }} />
            <Button
              title="Ver meu plano"
              variant="secondary"
              onPress={() => router.push("/(tabs)/plan")}
            />
          </Card>
        )}
        {(
          [
            {
              bucket: "RESERVE",
              title: "Reserva de emergência",
              value: registeredReserveValue,
              hint: "Dinheiro separado para imprevistos, com baixo risco e facilidade de resgate.",
            },
            {
              bucket: "LONG_TERM",
              title: "Carteira de longo prazo",
              value: strategyPortfolio.totalValue,
              hint: "Investimentos distribuídos de acordo com o seu objetivo.",
            },
          ] as const
        ).map((group) => {
          const items = assets.filter((asset) => asset.bucket === group.bucket);
          if (!items.length) return null;
          return (
            <View key={group.bucket}>
              <View style={styles.groupHeader}>
                <Text style={styles.heading}>{group.title}</Text>
                <Text style={styles.groupValue}>{money(group.value)}</Text>
              </View>
              <Text style={[styles.text, { marginBottom: 12 }]}>
                {group.hint}
              </Text>
              {items.map((asset) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ver ${asset.symbol}, ${asset.name}`}
                  key={asset.id}
                  onPress={() => router.push(`/asset/${asset.id}`)}
                >
                  <Card style={styles.assetCard}>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: `${arcaColors[asset.arcaClass]}18` },
                      ]}
                    >
                      <Text
                        style={{
                          color: arcaColors[asset.arcaClass],
                          fontWeight: "800",
                        }}
                      >
                        {(asset.assetType === "BALANCE"
                          ? asset.name
                          : asset.symbol
                        )
                          .slice(0, 2)
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assetName}>
                        {asset.assetType === "BALANCE"
                          ? asset.name
                          : asset.symbol}
                      </Text>
                      {asset.assetType !== "BALANCE" && (
                        <Text style={styles.text}>{asset.name}</Text>
                      )}
                      <Text
                        style={{
                          color: colors.primary,
                          fontSize: 18,
                          fontWeight: "800",
                          marginTop: 6,
                        }}
                      >
                        {money(asset.currentValue ?? "0")}
                      </Text>
                      <Text style={styles.meta}>
                        {ARCA_LABELS[asset.arcaClass]} ·{" "}
                        {asset.quoteMode === "API"
                          ? "Cotação automática"
                          : "Valor informado por você"}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Card>
                </Pressable>
              ))}
            </View>
          );
        })}
        <View style={{ height: 20 }} />
        <Button
          title="Registrar investimento realizado"
          onPress={() => router.push("/contribution")}
        />
        <View style={{ height: 12 }} />
        <Button
          title="Importar comprovante ou extrato"
          variant="secondary"
          onPress={() => router.push("/import-investments")}
        />
        <Text style={styles.importHint}>
          Confira os dados da compra antes de adicioná-la à carteira.
        </Text>
        <Text style={styles.footnote}>
          Para conhecer opções, riscos e fontes, visite Meu plano.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: layout.tabBottomSpace },
  infoTitle: { color: colors.ink, fontWeight: "800", fontSize: 17 },
  text: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 4 },
  heading: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "800",
    flexShrink: 1,
  },
  groupHeader: { marginTop: 28, gap: 8 },
  groupValue: { color: colors.primary, fontSize: 24, fontWeight: "800" },
  assetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  assetName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 6 },
  chevron: { fontSize: 26, color: colors.muted },
  importHint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    textAlign: "center",
  },
  footnote: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 16,
  },
});
