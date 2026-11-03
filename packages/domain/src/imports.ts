import Decimal from "decimal.js";
import { z } from "zod";
import { ArcaClassSchema } from "./types";
import { localDateString } from "./planning";

const decimal = (allowZero: boolean) =>
  z
    .string()
    .regex(/^\d{1,18}(?:\.\d{1,12})?$/, "Use um número decimal válido.")
    .refine((value) => {
      try {
        return allowZero || new Decimal(value).gt(0);
      } catch {
        return false;
      }
    }, "O valor deve ser maior que zero.")
    .transform((value) => new Decimal(value).toFixed());

export const ReviewedImportTradeSchema = z
  .object({
    symbol: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}\d{1,2}$/, "Informe o código de negociação na B3."),
    name: z.string().trim().min(1).max(160),
    arcaClass: ArcaClassSchema,
    assetType: z.enum(["EQUITY", "ETF", "FII"]),
    tradeDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const parsed = new Date(`${value}T12:00:00Z`);
        return (
          Number.isFinite(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value &&
          value <= localDateString(new Date())
        );
      }, "Informe uma data válida, até hoje."),
    type: z.enum(["BUY", "SELL"]),
    quantity: decimal(false),
    unitPrice: decimal(false),
    fees: decimal(true).default("0"),
    broker: z.string().trim().max(120).default(""),
    bucket: z.literal("LONG_TERM").default("LONG_TERM"),
  })
  .superRefine((trade, context) => {
    if (
      (trade.assetType === "FII" && trade.arcaClass !== "REAL_ESTATE") ||
      (trade.assetType === "EQUITY" &&
        !["BRAZIL_STOCKS", "INTERNATIONAL"].includes(trade.arcaClass))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["arcaClass"],
        message: "A categoria não corresponde ao tipo de investimento.",
      });
    }
  });

export type ReviewedImportTrade = z.infer<typeof ReviewedImportTradeSchema>;

/** Economic identity excludes filenames and broker labels so overlapping files match. */
export function investmentTradeIdentity(
  trade: Pick<
    ReviewedImportTrade,
    "symbol" | "tradeDate" | "type" | "quantity" | "unitPrice" | "fees"
  >,
): string {
  return JSON.stringify([
    trade.symbol.trim().toUpperCase(),
    trade.tradeDate,
    trade.type,
    new Decimal(trade.quantity).toFixed(),
    new Decimal(trade.unitPrice).toFixed(),
    new Decimal(trade.fees).toFixed(),
  ]);
}
