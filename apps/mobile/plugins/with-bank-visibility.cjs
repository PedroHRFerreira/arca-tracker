const { withAndroidManifest } = require("expo/config-plugins");

// Narrow package visibility is needed by Expo's getLaunchIntentForPackage call.
// Source: https://developer.android.com/training/package-visibility/declaring
const BANK_PACKAGES = ["com.nu.production", "com.mercadopago.wallet"];

function addBankPackageQueries(androidManifest) {
  const queries = (androidManifest.manifest.queries ??= []);
  if (queries.length === 0) queries.push({});
  const existing = new Set(
    queries.flatMap((query) => query.package ?? []).map((entry) => entry.$?.["android:name"]),
  );
  const packages = (queries[0].package ??= []);
  for (const packageName of BANK_PACKAGES) {
    if (!existing.has(packageName)) {
      packages.push({ $: { "android:name": packageName } });
      existing.add(packageName);
    }
  }
  return androidManifest;
}

module.exports = function withBankVisibility(config) {
  return withAndroidManifest(config, (mod) => {
    mod.modResults = addBankPackageQueries(mod.modResults);
    return mod;
  });
};
module.exports.addBankPackageQueries = addBankPackageQueries;
