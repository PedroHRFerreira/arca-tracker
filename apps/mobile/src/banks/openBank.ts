import { Linking, Platform } from "react-native";
import { getBankCapability, type BankInstitution } from "@arca/domain";

export interface BankOpeningAvailability {
  /** An Android launch can be attempted; this does not check installation. */
  canOpenApp: boolean;
  appLabel?: string;
  instructionsLabel?: string;
  instructionsUrl?: string;
  message: string;
}

export interface BankOpeningResult {
  status: "opened" | "unavailable" | "failed";
  message: string;
  instructionsUrl?: string;
}

export function getBankOpeningAvailability(
  institution: BankInstitution,
): BankOpeningAvailability {
  const bank = getBankCapability(institution);
  if (!bank) {
    return {
      canOpenApp: false,
      message:
        "Ainda não temos instruções verificadas para essa instituição. Consulte os canais oficiais do seu banco.",
    };
  }
  return {
    canOpenApp: Platform.OS === "android",
    appLabel: Platform.OS === "android" ? `Abrir app ${bank.name}` : undefined,
    instructionsLabel: `Ver instruções no site oficial ${bank.name}`,
    instructionsUrl: bank.instructionsUrl,
    message:
      Platform.OS === "android"
        ? "Abre o aplicativo instalado. Depois, procure o investimento e decida no banco; nenhuma ordem será preenchida."
        : "Neste dispositivo, consulte as instruções no site oficial e abra o aplicativo do banco manualmente para investir.",
  };
}

export async function openBankApp(
  institution: BankInstitution,
): Promise<BankOpeningResult> {
  const bank = getBankCapability(institution);
  const availability = getBankOpeningAvailability(institution);
  if (!bank || !availability.canOpenApp) {
    return {
      status: "unavailable",
      message: availability.message,
      instructionsUrl: availability.instructionsUrl,
    };
  }
  try {
    // Android package IDs are verified against each bank's official Play listing.
    // No account identifier, asset symbol or order data leaves Arca.
    const { openApplication } = await import("expo-intent-launcher");
    await openApplication(bank.androidPackageName);
    return {
      status: "opened",
      message: `${bank.name} aberto. Procure o investimento e confira as condições antes de decidir.`,
      instructionsUrl: bank.instructionsUrl,
    };
  } catch {
    return {
      status: "failed",
      message: `Não foi possível abrir o app ${bank.name}. Ele pode não estar instalado ou estar indisponível. Abra-o manualmente ou consulte as instruções no site oficial.`,
      instructionsUrl: bank.instructionsUrl,
    };
  }
}

/** Only call from a separately labeled official-website action. */
export async function openBankInstructions(
  institution: BankInstitution,
): Promise<BankOpeningResult> {
  const bank = getBankCapability(institution);
  if (!bank) {
    return {
      status: "unavailable",
      message: getBankOpeningAvailability(institution).message,
    };
  }
  try {
    await Linking.openURL(bank.instructionsUrl);
    return {
      status: "opened",
      message: `Instruções no site oficial ${bank.name} abertas.`,
      instructionsUrl: bank.instructionsUrl,
    };
  } catch {
    return {
      status: "failed",
      message:
        "Não foi possível abrir o site oficial. Tente novamente ou consulte a ajuda no aplicativo do banco.",
      instructionsUrl: bank.instructionsUrl,
    };
  }
}
