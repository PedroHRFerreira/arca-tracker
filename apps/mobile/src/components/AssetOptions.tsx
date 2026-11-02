import { PressFeedback as Pressable } from "@/motion/Motion";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  INVESTMENT_CATALOG,
  CATALOG_VERSION,
  allocateContribution,
  evaluatePlan,
  calculateBudget,
  type PortfolioSummary,
  type PlanningProfile,
  type PlanningTargets,
  type InvestmentCatalogEntry,
} from "@arca/domain";
import { fetchMarketQuote } from "@/api/market";
import { Card } from "@/components/ui";
import { colors, money } from "@/theme";
import { displayPlanDate } from "@/components/PlanSummary";

export function AssetOptions({
  strategy = "ARCA",
  targets,
  profile,
  reserveValue,
  portfolio,
}: {
  strategy?: PlanningProfile["strategy"];
  targets?: PlanningTargets;
  profile?: PlanningProfile;
  reserveValue?: string;
  portfolio?: PortfolioSummary;
}) {
  const evaluation = profile ? evaluatePlan(profile, reserveValue) : null;
  const budget = profile ? calculateBudget(profile) : null;
  const allocation =
    profile && portfolio
      ? allocateContribution({ profile, portfolio, reserveValue })
      : null;
  const paused =
    evaluation?.phase === "DEBT" ||
    (budget?.configured && Number(budget.available) === 0);
  const entries = INVESTMENT_CATALOG.filter(
    (entry) =>
      !paused &&
      (evaluation?.phase === "RESERVE"
        ? entry.assetType === "TREASURY"
        : true) &&
      (evaluation?.phase === "RESERVE" ||
        !targets ||
        Number(targets[entry.arcaClass]) > 0) &&
      (strategy !== "SIMPLE" ||
        entry.assetType === "TREASURY" ||
        (entry.assetType === "ETF" && entry.broadMarket)),
  );
  return (
    <Card>
      <Text style={styles.eyebrow}>CONHEÇA AS POSSIBILIDADES</Text>
      <Text style={styles.title}>Opções para o seu próximo passo</Text>
      <Text style={styles.copy}>
        Exemplos para estudar e comparar. Abra cada um para entender sua
        finalidade, riscos, resgate e custos.
      </Text>
      <Text style={styles.copy}>
        Este catálogo não é uma carteira pronta nem uma ordem de compra. Uma
        ação ou um fundo isolado não garante diversificação.
      </Text>
      {entries.map((entry) => (
        <AssetOption
          key={entry.symbol}
          entry={entry}
          plannedAmount={
            allocation
              ? evaluation?.phase === "RESERVE"
                ? allocation.reserve
                : allocation.investments[entry.arcaClass]
              : undefined
          }
        />
      ))}
      {!entries.length && (
        <Text style={styles.copy}>
          {paused
            ? "Organize o orçamento e as dívidas primeiro. As opções de investimento aparecem quando houver espaço para avançar no plano."
            : "Não há exemplos verificados para esta distribuição no catálogo atual."}
        </Text>
      )}
      <Text style={styles.small}>
        Catálogo {CATALOG_VERSION}. Fontes e condições consultadas nas datas
        indicadas. Preços não são necessários para criar seu plano.
      </Text>
    </Card>
  );
}

function AssetOption({
  entry,
  plannedAmount,
}: {
  entry: InvestmentCatalogEntry;
  plannedAmount?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<{
    price: string;
    capturedAt: string;
    source: string;
  } | null>(null);
  const [error, setError] = useState("");
  async function consult() {
    setLoading(true);
    setError("");
    try {
      const result = await Promise.race([
        fetchMarketQuote(entry.symbol),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT")), 10000),
        ),
      ]);
      setQuote(result);
    } catch {
      setError(
        "Cotação indisponível agora. Confira sua conexão e a configuração do serviço em Ajustes. As informações educativas continuam disponíveis.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <View style={styles.item}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${expanded ? "Recolher" : "Conhecer"} ${entry.name}`}
        onPress={() => setExpanded(!expanded)}
        style={styles.itemHeader}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.symbol}>
            {entry.symbol === "TESOURO_SELIC" ? "RENDA FIXA" : entry.symbol}
          </Text>
          <Text style={styles.name}>{entry.name}</Text>
        </View>
        <Text style={styles.expand}>{expanded ? "−" : "+"}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.details}>
          {plannedAmount !== undefined && (
            <Text style={styles.detailLabel}>
              Valor planejado para este grupo: {money(plannedAmount)}. Compare
              as opções; esse valor não é destinado integralmente a cada
              exemplo.
            </Text>
          )}
          <Detail label="Para que serve" value={entry.purpose} />
          <Detail label="Riscos" value={entry.risks.join(" ")} />
          <Detail label="Quando posso resgatar?" value={entry.liquidity} />
          <Detail label="Custos e impostos" value={entry.costs} />
          <Text style={styles.small}>
            Informações verificadas em {displayPlanDate(entry.asOf)}.
          </Text>
          {entry.sources.map((source) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              onPress={() =>
                Linking.openURL(source.url).catch(() =>
                  setError(
                    "Não foi possível abrir a fonte. Tente novamente com uma conexão disponível.",
                  ),
                )
              }
              style={styles.source}
            >
              <Text style={styles.link}>{source.title} ↗</Text>
            </Pressable>
          ))}
          {entry.assetType !== "TREASURY" ? (
            <>
              {quote && (
                <Text style={styles.copy}>
                  Última consulta: {money(quote.price)} · {quote.source}
                  {"\n"}
                  {new Date(quote.capturedAt).toLocaleString("pt-BR")} · o preço
                  pode mudar.
                </Text>
              )}
              {quote &&
                plannedAmount !== undefined &&
                Number(quote.price) > Number(plannedAmount) && (
                  <Text style={styles.copy}>
                    Esta parcela é menor que o preço consultado de uma unidade.
                    Você pode acumular aportes; confira a quantidade mínima na
                    instituição antes de comprar.
                  </Text>
                )}
              <Pressable
                accessibilityRole="button"
                disabled={loading}
                onPress={consult}
                style={styles.quoteButton}
              >
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.link}>
                    {quote
                      ? "Consultar cotação novamente"
                      : "Consultar cotação de mercado"}
                  </Text>
                )}
              </Pressable>
            </>
          ) : (
            <Text style={styles.small}>
              Preço, vencimento e disponibilidade devem ser conferidos no
              Tesouro Direto antes de investir.
            </Text>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.copy}>{value}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "800",
    letterSpacing: 1,
  },
  title: { fontSize: 21, color: colors.ink, fontWeight: "800", marginTop: 9 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 21, marginTop: 6 },
  small: { color: colors.muted, fontSize: 11, lineHeight: 18, marginTop: 12 },
  item: { borderTopWidth: 1, borderColor: colors.border, marginTop: 16 },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 15,
    gap: 14,
    minHeight: 64,
  },
  symbol: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  name: { fontSize: 14, color: colors.ink, marginTop: 4 },
  expand: {
    color: colors.primary,
    fontSize: 24,
    width: 24,
    textAlign: "center",
  },
  details: { gap: 12, paddingBottom: 12 },
  detailLabel: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  source: { paddingVertical: 9 },
  link: {
    fontWeight: "700",
    fontSize: 13,
    color: colors.primary,
    lineHeight: 20,
  },
  quoteButton: {
    paddingVertical: 13,
    paddingHorizontal: 12,
    backgroundColor: "#EDF2E9",
    borderRadius: 10,
    alignItems: "center",
  },
  error: { color: colors.danger, fontSize: 12, lineHeight: 20 },
});
