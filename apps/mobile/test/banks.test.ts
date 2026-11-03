import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { BANK_CAPABILITIES } from "@arca/domain";

const state = vi.hoisted(() => ({
  platform: { OS: "android" },
  openApplication: vi.fn(),
  openURL: vi.fn(),
}));
vi.mock("react-native", () => ({
  Platform: state.platform,
  Linking: { openURL: state.openURL },
}));
vi.mock("expo-intent-launcher", () => ({
  openApplication: state.openApplication,
}));

import {
  getBankOpeningAvailability,
  openBankApp,
  openBankInstructions,
} from "../src/banks/openBank";

beforeEach(() => {
  vi.resetAllMocks();
  state.platform.OS = "android";
  state.openURL.mockResolvedValue(undefined);
});

describe("manual bank handoff", () => {
  it.each([
    ["NUBANK", "com.nu.production"],
    ["MERCADO_PAGO", "com.mercadopago.wallet"],
  ] as const)("opens only the verified Android app for %s", async (bank, packageName) => {
    expect((await openBankApp(bank)).status).toBe("opened");
    expect(state.openApplication).toHaveBeenCalledExactlyOnceWith(packageName);
    expect(state.openURL).not.toHaveBeenCalled();
  });

  it("reports a missing or unavailable app without silently launching a website", async () => {
    state.openApplication.mockImplementation(() => {
      throw new Error("Application not found");
    });
    const result = await openBankApp("NUBANK");
    expect(result.status).toBe("failed");
    expect(result.message).toContain("pode não estar instalado");
    expect(result.instructionsUrl).toBe("https://nubank.com.br/nu/investimentos");
    expect(state.openURL).not.toHaveBeenCalled();
  });

  it.each(["web", "ios"])("offers clearly labeled website instructions on %s", async (platform) => {
    state.platform.OS = platform;
    const availability = getBankOpeningAvailability("NUBANK");
    expect(availability.canOpenApp).toBe(false);
    expect(availability.appLabel).toBeUndefined();
    expect(availability.instructionsLabel).toContain("site oficial");
    expect((await openBankApp("NUBANK")).status).toBe("unavailable");
    expect(state.openApplication).not.toHaveBeenCalled();
    expect(state.openURL).not.toHaveBeenCalled();
  });

  it("opens instructions only after the separate website action", async () => {
    state.platform.OS = "web";
    expect((await openBankInstructions("MERCADO_PAGO")).status).toBe("opened");
    expect(state.openURL).toHaveBeenCalledExactlyOnceWith(
      "https://www.mercadopago.com.br/blog/fundos-de-investimentos-no-mercado-pago",
    );
    expect(state.openApplication).not.toHaveBeenCalled();
  });

  it("keeps website failure recoverable", async () => {
    state.openURL.mockRejectedValue(new Error("Offline"));
    expect((await openBankInstructions("NUBANK")).status).toBe("failed");
  });

  it("never invents a destination for an unsupported institution", async () => {
    expect(getBankOpeningAvailability("OTHER").instructionsUrl).toBeUndefined();
    expect((await openBankApp("OTHER")).status).toBe("unavailable");
    expect((await openBankInstructions("OTHER")).status).toBe("unavailable");
    expect(state.openApplication).not.toHaveBeenCalled();
    expect(state.openURL).not.toHaveBeenCalled();
  });
});

interface TestManifest {
  manifest: {
    queries?: Array<{
      package?: Array<{ $: { "android:name": string } }>;
      intent?: unknown[];
    }>;
    "uses-permission"?: Array<{ $: { "android:name": string } }>;
  };
}

const { addBankPackageQueries } = createRequire(import.meta.url)(
  "../plugins/with-bank-visibility.cjs",
) as { addBankPackageQueries: (manifest: TestManifest) => TestManifest };

describe("Android bank visibility", () => {
  it("declares only the two verified bank packages without broad package permissions", () => {
    const result = addBankPackageQueries({ manifest: {} });
    expect(result.manifest.queries?.flatMap((query) => query.package ?? [])).toEqual(
      BANK_CAPABILITIES.map((bank) => ({ $: { "android:name": bank.androidPackageName } })),
    );
    expect(result.manifest["uses-permission"]).toBeUndefined();
  });

  it("preserves existing queries and stays idempotent across repeated builds", () => {
    const existingIntent = [{ action: [{ $: { "android:name": "android.intent.action.VIEW" } }] }];
    const manifest: TestManifest = {
      manifest: {
        queries: [
          { intent: existingIntent },
          { package: [{ $: { "android:name": "com.nu.production" } }] },
        ],
      },
    };
    addBankPackageQueries(manifest);
    const once = structuredClone(manifest);
    addBankPackageQueries(manifest);
    expect(manifest).toEqual(once);
    expect(manifest.manifest.queries?.[0].intent).toEqual(existingIntent);
    expect(manifest.manifest.queries?.flatMap((query) => query.package ?? [])).toHaveLength(2);
  });
});
