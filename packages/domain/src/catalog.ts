import { z } from "zod";
import type { ArcaClass } from "./types";

export const CATALOG_VERSION = "2026-11-02.1";
export const CATALOG_AS_OF = "2026-11-02";

export const ScreeningMetadataSchema = z.object({
  assetType: z.enum(["EQUITY", "ETF", "FII", "TREASURY"]),
  exposure: z.enum([
    "BRAZIL",
    "GLOBAL",
    "BRAZIL_REAL_ESTATE",
    "BRAZIL_FIXED_INCOME",
  ]),
  broadMarket: z.boolean(),
  purpose: z.string(),
  risks: z.array(z.string()),
  liquidity: z.string(),
  costs: z.string(),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })),
  asOf: z.string(),
  catalogVersion: z.string(),
});
export type ScreeningMetadata = z.infer<typeof ScreeningMetadataSchema>;
export interface InvestmentCatalogEntry extends ScreeningMetadata {
  symbol: string;
  name: string;
  arcaClass: ArcaClass;
}

const exchangeLiquidity =
  "Venda na bolsa durante o pregão, conforme compradores e preço disponível. O dinheiro segue o prazo de liquidação da operação.";

// Educational examples, researched at the version date. These are not live
// prices, a complete investment universe, or a recommendation to buy.
export const INVESTMENT_CATALOG: readonly InvestmentCatalogEntry[] = [
  {
    symbol: "BOVA11",
    name: "iShares Ibovespa",
    arcaClass: "BRAZIL_STOCKS",
    assetType: "ETF",
    exposure: "BRAZIL",
    broadMarket: true,
    purpose: "Acompanhar o Ibovespa com uma cesta de ações brasileiras.",
    risks: [
      "Oscilação das ações brasileiras e possibilidade de perda.",
      "Concentração nos setores e empresas com maior peso no índice.",
    ],
    liquidity: exchangeLiquidity,
    costs:
      "Taxa de administração informada pela gestora: 0,10% ao ano na data da pesquisa. Corretagem, negociação e impostos podem se aplicar.",
    sources: [
      {
        title: "BlackRock — BOVA11",
        url: "https://www.blackrock.com/br/products/251816/ishares-ibovespa-fundo-de-ndice-fund",
      },
    ],
    asOf: CATALOG_AS_OF,
    catalogVersion: CATALOG_VERSION,
  },
  {
    symbol: "WRLD11",
    name: "Investo Total World",
    arcaClass: "INTERNATIONAL",
    assetType: "ETF",
    exposure: "GLOBAL",
    broadMarket: true,
    purpose:
      "Acessar ações de países desenvolvidos e emergentes por meio do ETF global VT.",
    risks: [
      "Oscilação das bolsas mundiais e do câmbio, com possibilidade de perda.",
      "Não possui garantia do FGC.",
    ],
    liquidity: exchangeLiquidity,
    costs:
      "Taxa global não disponível nesta consulta. Confira a lâmina atual da gestora; negociação, corretagem e impostos podem se aplicar.",
    sources: [
      {
        title: "Investo — WRLD11 e documentos do fundo",
        url: "https://www.investoetf.com/etf/wrld11/",
      },
    ],
    asOf: CATALOG_AS_OF,
    catalogVersion: CATALOG_VERSION,
  },
  {
    symbol: "PETR4",
    name: "Petrobras — ação preferencial",
    arcaClass: "BRAZIL_STOCKS",
    assetType: "EQUITY",
    exposure: "BRAZIL",
    broadMarket: false,
    purpose:
      "Exemplo de participação em uma empresa brasileira; exige analisar a empresa individualmente.",
    risks: [
      "Concentração em uma empresa e no setor de petróleo.",
      "Preço e dividendos podem cair; o capital investido não é garantido.",
    ],
    liquidity: exchangeLiquidity,
    costs:
      "Custos de corretagem e negociação dependem da instituição. Confira a tributação aplicável antes de operar.",
    sources: [
      {
        title: "Petrobras — perguntas do investidor",
        url: "https://www.investidorpetrobras.com.br/servicos-ao-investidor/investidor-individual/perguntas-frequentes/",
      },
    ],
    asOf: CATALOG_AS_OF,
    catalogVersion: CATALOG_VERSION,
  },
  {
    symbol: "HGLG11",
    name: "Pátria Log FII",
    arcaClass: "REAL_ESTATE",
    assetType: "FII",
    exposure: "BRAZIL_REAL_ESTATE",
    broadMarket: false,
    purpose: "Exemplo de fundo de imóveis voltados a logística e indústria.",
    risks: [
      "Vacância, inadimplência de locatários e concentração imobiliária.",
      "Cotas e rendimentos podem cair; não há renda garantida.",
    ],
    liquidity: exchangeLiquidity,
    costs:
      "Taxas atuais não disponíveis nesta consulta. Confira o regulamento na gestora, além de negociação, corretagem e tributação aplicável.",
    sources: [
      {
        title: "Pátria — HGLG11 e regulamento",
        url: "https://realestate.patria.com/tijolo/hglg11/",
      },
    ],
    asOf: CATALOG_AS_OF,
    catalogVersion: CATALOG_VERSION,
  },
  {
    symbol: "TESOURO_SELIC",
    name: "Tesouro Selic",
    arcaClass: "CASH_FIXED_INCOME",
    assetType: "TREASURY",
    exposure: "BRAZIL_FIXED_INCOME",
    broadMarket: false,
    purpose:
      "Título público ligado à Selic para a parcela de renda fixa. Compare prazos de resgate com sua necessidade de reserva.",
    risks: [
      "Risco do Tesouro Nacional e oscilação de preço na venda antecipada.",
      "O resgate depende dos horários e condições do programa; não é dinheiro imediato a qualquer hora.",
    ],
    liquidity:
      "Recompra pelo Tesouro conforme dias, horários e regras do programa, ao preço de mercado.",
    costs:
      "Custódia B3 de 0,20% ao ano, com isenção dos primeiros R$ 10 mil em Tesouro Selic por CPF; taxa da instituição e impostos podem se aplicar. Confira as regras atuais.",
    sources: [
      {
        title: "Tesouro Direto — regras e regulamento",
        url: "https://tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento",
      },
    ],
    asOf: CATALOG_AS_OF,
    catalogVersion: CATALOG_VERSION,
  },
];

export function getAssetCatalogMetadata(
  symbol: string,
): InvestmentCatalogEntry | undefined {
  return INVESTMENT_CATALOG.find(
    (entry) => entry.symbol === symbol.trim().toUpperCase(),
  );
}
