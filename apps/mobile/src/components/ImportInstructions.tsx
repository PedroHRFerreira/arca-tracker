import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "@/components/ui";
import { PressFeedback, Reveal } from "@/motion/Motion";
import { colors } from "@/theme";

const steps = [
  {
    title: "Compre na sua instituição",
    detail: "Baixe o comprovante da compra concluída.",
  },
  {
    title: "Envie o documento",
    detail: "Escolha um PDF com texto, CSV ou Excel.",
  },
  {
    title: "Confira e salve",
    detail: "Revise os dados e a categoria antes de adicionar à carteira.",
  },
];

export function ImportInstructions() {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>
        Do comprovante para sua carteira
      </Text>
      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={step.title} style={styles.step}>
            <View style={styles.number}>
              <Text style={styles.numberText}>{index + 1}</Text>
            </View>
            <View style={styles.stepCopy}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.detail}>{step.detail}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={styles.privacy}>
        <Ionicons
          name="shield-checkmark-outline"
          size={17}
          color={colors.primary}
          accessible={false}
        />
        <Text style={styles.privacyText}>
          A leitura acontece neste aparelho. Seu documento não é enviado a um
          servidor.
        </Text>
      </View>
      <PressFeedback
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={
          expanded
            ? "Ocultar documentos aceitos e limites"
            : "Ver documentos aceitos e limites"
        }
        onPress={() => setExpanded((value) => !value)}
        style={styles.helpButton}
      >
        <Text style={styles.helpLabel}>Quais documentos posso enviar?</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.primary}
          accessible={false}
        />
      </PressFeedback>
      {expanded && (
        <Reveal style={styles.help}>
          <Text style={styles.helpText}>
            O documento precisa mostrar uma compra ou venda concluída de ações,
            ETFs ou fundos imobiliários, com ativo, data, quantidade e preço.
          </Text>
          <Text style={styles.helpText}>
            Comprovantes de Pix, extratos da conta e listas de saldo ou posições
            não confirmam uma negociação e não são importados.
          </Text>
          <Text style={styles.helpText}>
            PDFs precisam ter texto selecionável e estar sem senha. Fotos e
            documentos digitalizados como imagem ainda não são aceitos.
          </Text>
          <Text style={styles.limit}>
            Até 10 MB por arquivo, 100 páginas por PDF e 500 operações por
            importação. Formatos não reconhecidos não alteram sua carteira.
          </Text>
        </Reveal>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18 },
  title: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 25 },
  steps: { gap: 17 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  number: {
    width: 29,
    height: 29,
    borderRadius: 15,
    backgroundColor: "#EAF2ED",
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  detail: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  privacy: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  privacyText: { flex: 1, color: colors.primary, fontSize: 12, lineHeight: 18 },
  helpButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
  },
  helpLabel: {
    flex: 1,
    color: colors.primary,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
  },
  help: { gap: 10 },
  helpText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  limit: { color: colors.ink, fontSize: 12, lineHeight: 19 },
});
