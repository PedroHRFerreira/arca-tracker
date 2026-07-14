import { useState } from "react";
import { router } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ARCA_LABELS, type ArcaClass } from "@arca/domain";
import { Button, Card, ScreenHeader } from "@/components/ui";
import { fetchScreening } from "@/api/market";
import { useApp } from "@/providers/AppProvider";
import { arcaColors, colors } from "@/theme";

interface ScreeningSuggestion {
  symbol: string;
  name: string;
  criterion: string;
  source: string;
  capturedAt: string;
}

export default function Assets() {
  const { assets } = useApp();
  const [tab, setTab] = useState<"mine" | "suggestions">("mine");
  const [suggestions, setSuggestions] = useState<
    Record<string, ScreeningSuggestion[] | null>
  >({});
  const [expandedClass, setExpandedClass] = useState<ArcaClass | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadSuggestions() {
    setLoading(true);
    const classes: ArcaClass[] = [
      "BRAZIL_STOCKS",
      "REAL_ESTATE",
      "CASH_FIXED_INCOME",
      "INTERNATIONAL",
    ];
    const entries: Array<readonly [ArcaClass, ScreeningSuggestion[] | null]> = [];
    // Sequential requests let the proxy reuse the same cached B3 universe,
    // reducing consumption of the free API quota.
    for (const arcaClass of classes) {
      try {
        entries.push([arcaClass, await fetchScreening(arcaClass)] as const);
      } catch {
        entries.push([arcaClass, null] as const);
      }
    }
    setSuggestions(Object.fromEntries(entries));
    setLoading(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader
          title="Ativos"
          subtitle="Posições e candidatos por regra pública"
        />
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab("mine")}
            style={[styles.tab, tab === "mine" && styles.activeTab]}
          >
            <Text
              style={[styles.tabText, tab === "mine" && styles.activeTabText]}
            >
              Meus Ativos
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setTab("suggestions");
              if (!Object.keys(suggestions).length) loadSuggestions();
            }}
            style={[styles.tab, tab === "suggestions" && styles.activeTab]}
          >
            <Text
              style={[
                styles.tabText,
                tab === "suggestions" && styles.activeTabText,
              ]}
            >
              Sugestões
            </Text>
          </Pressable>
        </View>
        {tab === "mine" ? (
          <>
            {assets.length ? (
              assets.map((asset) => (
                <Pressable
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
                          fontWeight: "900",
                        }}
                      >
                        {asset.symbol.slice(0, 2)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.assetName}>{asset.symbol}</Text>
                      <Text style={styles.assetMeta}>
                        {asset.name} · {ARCA_LABELS[asset.arcaClass]}
                      </Text>
                    </View>
                    <Text style={styles.mode}>
                      {asset.quoteMode === "API" ? "API" : "Manual"}
                    </Text>
                  </Card>
                </Pressable>
              ))
            ) : (
              <Card>
                <Text style={styles.emptyTitle}>Sua carteira está vazia</Text>
                <Text style={styles.emptyText}>
                  Cadastre um ativo e registre o primeiro aporte para começar.
                </Text>
              </Card>
            )}
            <Button
              title="+ Adicionar ativo ou aporte"
              onPress={() => router.push("/contribution")}
            />
          </>
        ) : (
          <>
            <Card style={{ backgroundColor: "#EEF3FF" }}>
              <Text style={styles.infoTitle}>Top 10 por quadrante</Text>
              <Text style={styles.infoText}>
                O primeiro colocado aparece em destaque. Abra a lista para
                escolher outras opções do ranking dinâmico.
              </Text>
            </Card>
            {loading ? (
              <Text style={styles.loading}>Consultando fontes públicas…</Text>
            ) : (
              Object.entries(suggestions).map(([arcaClass, items]) =>
                items?.length ? (
                  <Card key={arcaClass} style={{ marginTop: 12 }}>
                    <Text
                      style={[
                        styles.classLabel,
                        { color: arcaColors[arcaClass as ArcaClass] },
                      ]}
                    >
                      {ARCA_LABELS[arcaClass as ArcaClass]}
                    </Text>
                    {(expandedClass === arcaClass
                      ? items
                      : items.slice(0, 1)
                    ).map((item, index) => (
                      <View
                        key={item.symbol}
                        style={[styles.rankingItem, index > 0 && styles.rankingDivider]}
                      >
                        <View style={styles.rankHeader}>
                          <Text style={styles.rank}>#{index + 1}</Text>
                          <View style={styles.rankContent}>
                            <Text style={styles.suggestionName}>
                              {item.symbol} · {item.name}
                            </Text>
                            <Text style={styles.criterion}>{item.criterion}</Text>
                          </View>
                        </View>
                        <Button
                          title={index === 0 ? "Aceitar sugestão" : "Escolher esta opção"}
                          variant="secondary"
                          onPress={() =>
                            router.push({
                              pathname: "/contribution",
                              params: {
                                symbol: item.symbol,
                                name: item.name,
                                arcaClass,
                              },
                            })
                          }
                        />
                      </View>
                    ))}
                    <Text style={styles.source}>
                      {items[0].source} · atualizado em{" "}
                      {new Date(items[0].capturedAt).toLocaleString("pt-BR")}
                    </Text>
                    {items.length > 1 && (
                      <Pressable
                        style={styles.expandButton}
                        onPress={() =>
                          setExpandedClass(
                            expandedClass === arcaClass
                              ? null
                              : (arcaClass as ArcaClass),
                          )
                        }
                      >
                        <Text style={styles.expandText}>
                          {expandedClass === arcaClass
                            ? "Mostrar apenas o primeiro"
                            : `Ver mais ${items.length - 1} opções`}
                        </Text>
                      </Pressable>
                    )}
                  </Card>
                ) : (
                  <Card key={arcaClass} style={{ marginTop: 12 }}>
                    <Text style={styles.emptyText}>
                      Sem candidato disponível para{" "}
                      {ARCA_LABELS[arcaClass as ArcaClass]}.
                    </Text>
                  </Card>
                ),
              )
            )}
            <Text style={styles.disclaimer}>
              Rentabilidade passada não garante retorno futuro. Verifique o
              ativo antes de confirmar qualquer operação.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 100 },
  tabs: {
    flexDirection: "row",
    backgroundColor: "#E8ECF3",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, padding: 10, alignItems: "center", borderRadius: 9 },
  activeTab: { backgroundColor: "#FFF" },
  tabText: { color: colors.muted, fontWeight: "700" },
  activeTabText: { color: colors.primary },
  assetCard: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  assetName: { fontWeight: "900", color: colors.ink },
  assetMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  mode: { color: colors.primary, fontWeight: "800", fontSize: 11 },
  emptyTitle: { color: colors.ink, fontWeight: "900", fontSize: 18 },
  emptyText: { color: colors.muted, lineHeight: 20, marginTop: 5 },
  infoTitle: { color: colors.primary, fontWeight: "900" },
  infoText: { color: "#334155", lineHeight: 19, marginTop: 5 },
  loading: { color: colors.muted, textAlign: "center", margin: 30 },
  classLabel: { fontWeight: "900", fontSize: 12, textTransform: "uppercase" },
  suggestionName: {
    color: colors.ink,
    fontWeight: "900",
    fontSize: 17,
    marginTop: 5,
  },
  criterion: { color: colors.muted, marginVertical: 8 },
  source: { color: colors.muted, fontSize: 11, marginBottom: 14 },
  rankingItem: { gap: 10, paddingTop: 10 },
  rankingDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#D8DEE9",
    marginTop: 12,
    paddingTop: 16,
  },
  rankHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rank: { color: colors.primary, fontWeight: "900", minWidth: 26 },
  rankContent: { flex: 1 },
  expandButton: { alignItems: "center", paddingVertical: 10 },
  expandText: { color: colors.primary, fontWeight: "800" },
  disclaimer: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    margin: 18,
  },
});
