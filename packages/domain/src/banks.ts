import type { ScreeningMetadata } from "./catalog";

export type BankInstitution = "NUBANK" | "MERCADO_PAGO" | "OTHER";
export type BankInvestmentType =
  | ScreeningMetadata["assetType"]
  | "FIXED_INCOME"
  | "FUND";

export interface BankCapability {
  institution: Exclude<BankInstitution, "OTHER">;
  name: string;
  /** Publicly documented product families, not an account's offer catalog. */
  assetTypes: readonly BankInvestmentType[];
  androidPackageName: string;
  instructions: string;
  instructionsUrl: string;
  availabilityNote: string;
  verifiedAt: string;
  sources: readonly { title: string; url: string }[];
}

export const BANK_AVAILABILITY_NOTE =
  "A instituição divulga essa família de investimentos. Confirme no banco se o ativo está disponível para sua conta, além de preço, taxas, prazo e perfil exigido. O Open Finance não fornece um catálogo completo de ofertas.";

// These are places to check manually, with no asset/order deep links or live offers.
export const BANK_CAPABILITIES: readonly BankCapability[] = [
  {
    institution: "NUBANK",
    name: "Nubank",
    assetTypes: ["EQUITY", "ETF", "FII", "TREASURY", "FIXED_INCOME", "FUND"],
    androidPackageName: "com.nu.production",
    instructions:
      "No app do Nubank, procure a aba de Planejamento ($) e a área de Investimentos. Busque o investimento e confira as condições antes de decidir. A compra é feita por você no banco.",
    instructionsUrl: "https://nubank.com.br/nu/investimentos",
    availabilityNote: BANK_AVAILABILITY_NOTE,
    verifiedAt: "2026-11-02",
    sources: [
      {
        title: "Nubank — famílias de investimentos",
        url: "https://nubank.com.br/nu/investimentos",
      },
      {
        title: "Nubank — bolsa de valores",
        url: "https://nubank.com.br/nu/investimentos/bolsa-de-valores",
      },
      {
        title: "Nubank — como acessar investimentos no app",
        url: "https://nubank.com.br/nu/investimentos/cdb",
      },
      {
        title: "Google Play — app oficial Nubank",
        url: "https://play.google.com/store/apps/details?id=com.nu.production",
      },
    ],
  },
  {
    institution: "MERCADO_PAGO",
    name: "Mercado Pago",
    assetTypes: ["FIXED_INCOME", "FUND"],
    androidPackageName: "com.mercadopago.wallet",
    instructions:
      "No app do Mercado Pago, procure a área de investimentos e consulte as opções de renda fixa e fundos. Confira liquidez, taxas e condições na sua conta. A compra é feita por você no banco.",
    instructionsUrl:
      "https://www.mercadopago.com.br/blog/fundos-de-investimentos-no-mercado-pago",
    availabilityNote: BANK_AVAILABILITY_NOTE,
    verifiedAt: "2026-11-02",
    sources: [
      {
        title: "Mercado Pago — renda fixa no app",
        url: "https://www.mercadopago.com.br/blog/renda-fixa-preservar-capital-opcoes",
      },
      {
        title: "Mercado Pago — fundos e instruções no app",
        url: "https://www.mercadopago.com.br/blog/fundos-de-investimentos-no-mercado-pago",
      },
      {
        title: "Google Play — app oficial Mercado Pago",
        url: "https://play.google.com/store/apps/details?id=com.mercadopago.wallet",
      },
    ],
  },
];

export function getBankCapability(
  institution: BankInstitution,
): BankCapability | undefined {
  return BANK_CAPABILITIES.find((bank) => bank.institution === institution);
}

/** A family-level match is a place to check, never a confirmed product offer. */
export function getBanksForInvestment(
  assetType: BankInvestmentType,
): readonly BankCapability[] {
  return BANK_CAPABILITIES.filter((bank) => bank.assetTypes.includes(assetType));
}
