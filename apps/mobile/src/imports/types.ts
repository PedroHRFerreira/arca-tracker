import type { ArcaClass } from "@arca/domain";

export interface ImportDraftRow {
  key: string;
  symbol: string;
  name: string;
  tradeDate: string;
  type: "BUY" | "SELL" | null;
  quantity: string;
  unitPrice: string;
  fees: string;
  feesConfirmed: boolean;
  arcaClass: ArcaClass | null;
  assetType: "EQUITY" | "ETF" | "FII" | null;
  broker: string;
  sourceText: string;
}

export interface ImportDocument {
  text?: string;
  table?: string[][];
  fileName: string;
  warnings: string[];
}

export interface ImportAsset {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
  file?: File;
}

export const IMPORT_LIMITS = {
  bytes: 10 * 1024 * 1024,
  pages: 100,
  characters: 500_000,
  rows: 500,
} as const;
