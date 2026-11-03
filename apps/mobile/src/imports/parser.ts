import { getAssetCatalogMetadata } from "@arca/domain";
import {
  IMPORT_LIMITS,
  type ImportDocument,
  type ImportDraftRow,
} from "./types";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Only unambiguous positive decimal notation. Dot thousands are Brazilian. */
export function parseImportNumber(value: string): string {
  const input = value
    .trim()
    .replace(/^R\$\s*/, "")
    .replace(/\s/g, "");
  if (!input || !/^[\d.,]+$/.test(input)) return "";
  let canonical = input;
  if (input.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,8}$/.test(input)) return "";
    canonical = input.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(input)) {
    // A single dot and three digits can be decimal or thousands: require review.
    return "";
  } else if (!/^\d+(?:\.\d{1,8})?$/.test(input)) return "";
  if (!Number.isFinite(Number(canonical)) || Number(canonical) > 1e12)
    return "";
  return canonical.replace(/^0+(?=\d)/, "");
}

export function parseImportDate(value: string): string {
  const input = value.trim();
  let year: number, month: number, day: number;
  if (/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(input))
    [year, month, day] = input.slice(0, 10).split("-").map(Number);
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(input))
    [day, month, year] = input.split("/").map(Number);
  else return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 1990 ||
    year > 2100 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCsv(text: string): string[][] {
  if (text.length > IMPORT_LIMITS.characters)
    throw new Error("O arquivo tem texto demais. Divida em arquivos menores.");
  const first = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0];
  const delimiter =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : first.includes("\t")
        ? "\t"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (!quoted && cell.trim())
        throw new Error("CSV inválido: aspas fora de um campo.");
      else quoted = !quoted;
    } else if (
      !quoted &&
      (char === delimiter || char === "\n" || char === "\r")
    ) {
      row.push(cell);
      cell = "";
      if (char !== delimiter) {
        if (char === "\r" && text[i + 1] === "\n") i++;
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
        if (rows.length > IMPORT_LIMITS.rows + 20)
          throw new Error("Importe no máximo 500 operações por arquivo.");
      }
    } else cell += char;
  }
  if (quoted)
    throw new Error("CSV inválido: um campo ficou com aspas abertas.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const headers: Record<string, string[]> = {
  symbol: [
    "ticker",
    "codigo",
    "codigo de negociacao",
    "codigo negociacao",
    "codigo do ativo",
    "ativo",
  ],
  name: ["nome", "produto", "nome do ativo", "especificacao do titulo"],
  tradeDate: [
    "data",
    "data da operacao",
    "data do negocio",
    "data do pregao",
    "data de negociacao",
    "data da compra",
    "data da execucao",
  ],
  type: [
    "tipo",
    "tipo de movimentacao",
    "movimentacao",
    "operacao",
    "tipo de operacao",
    "compra/venda",
    "c/v",
  ],
  quantity: ["quantidade", "quantidade executada", "qtd", "qtde"],
  unitPrice: [
    "preco",
    "preco unitario",
    "preco unitario (r$)",
    "preco medio",
    "valor unitario",
    "preco / ajuste",
  ],
  fees: ["custos", "taxas", "taxas da operacao", "custos da operacao"],
  broker: ["instituicao", "corretora", "banco"],
};

function operation(value: string): ImportDraftRow["type"] {
  const normalized = normalize(value);
  return ["c", "compra", "buy", "compra a vista"].includes(normalized)
    ? "BUY"
    : ["v", "venda", "sell", "venda a vista"].includes(normalized)
      ? "SELL"
      : null;
}

function draft(
  values: Record<string, string>,
  index: number,
  sourceText: string,
): ImportDraftRow {
  const candidate = (values.symbol ?? "").trim().toUpperCase();
  // A company name is never converted to a ticker. Fractional execution suffix F is the same security.
  const symbol = /^[A-Z]{4}\d{1,2}F?$/.test(candidate)
    ? candidate.replace(/F$/, "")
    : "";
  const catalog = symbol ? getAssetCatalogMetadata(symbol) : undefined;
  const fees = parseImportNumber(values.fees ?? "");
  return {
    key: `document-${index}`,
    symbol,
    name: values.name?.trim() ?? "",
    tradeDate: parseImportDate(values.tradeDate ?? ""),
    type: operation(values.type ?? ""),
    quantity: parseImportNumber(values.quantity ?? ""),
    unitPrice: parseImportNumber(values.unitPrice ?? ""),
    fees,
    feesConfirmed: fees !== "",
    arcaClass: catalog?.arcaClass ?? null,
    assetType:
      catalog?.assetType === "TREASURY" ? null : (catalog?.assetType ?? null),
    broker: values.broker?.trim() ?? "",
    sourceText: sourceText.slice(0, 3000),
  };
}

function parseTable(table: string[][]): ImportDraftRow[] {
  for (
    let headerIndex = 0;
    headerIndex < Math.min(20, table.length);
    headerIndex++
  ) {
    const indices: Record<string, number> = {};
    for (const [field, aliases] of Object.entries(headers)) {
      const index = table[headerIndex].findIndex((value) =>
        aliases.includes(normalize(value)),
      );
      if (index >= 0) indices[field] = index;
    }
    // Account transaction tables do not qualify as security trades.
    if (
      !("quantity" in indices) ||
      !("unitPrice" in indices) ||
      (!("symbol" in indices) && !("name" in indices))
    )
      continue;
    const result: ImportDraftRow[] = [];
    for (const cells of table.slice(headerIndex + 1)) {
      const values = Object.fromEntries(
        Object.entries(indices).map(([field, index]) => [
          field,
          cells[index] ?? "",
        ]),
      );
      if (!values.symbol?.trim() && !values.name?.trim()) continue;
      if (/^(?:total|saldo|resumo)/i.test(values.symbol ?? values.name))
        continue;
      result.push(draft(values, result.length, cells.join(" | ")));
      if (result.length > IMPORT_LIMITS.rows)
        throw new Error("Importe no máximo 500 operações por arquivo.");
    }
    return result;
  }
  return [];
}

function parseReceipt(text: string): ImportDraftRow[] {
  const normalized = normalize(text);
  if (!/(?:compra|venda|negociac|nota de corretagem|pregao)/.test(normalized))
    return [];
  const values: Record<string, string> = {};
  let repeatField = false;
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fieldFor = (label: string) =>
    Object.entries(headers).find(([, aliases]) =>
      aliases.includes(normalize(label.replace(/:\s*$/, ""))),
    )?.[0];
  const knownLabelLine = (line: string) =>
    Boolean(fieldFor(line) || fieldFor(line.split(/:\s*|\s{2,}/, 1)[0]));
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const pair =
      /^([^:]{1,65})\s*:\s*(.+?)$/.exec(line) ??
      /^(.+?)\s{2,}(.+?)$/.exec(line);
    const field = fieldFor(pair?.[1] ?? line);
    if (!field) continue;
    let value = pair?.[2];
    if (
      !value &&
      lines[index + 1] &&
      !knownLabelLine(lines[index + 1]) &&
      !/^.{1,65}:/.test(lines[index + 1])
    ) {
      value = lines[++index];
    }
    if (!value) continue;
    if (values[field] && values[field] !== value) repeatField = true;
    values[field] = value;
  }
  // Never merge multiple receipts / executions into a fictitious single trade.
  if (
    repeatField ||
    (!values.symbol && !values.name) ||
    (!values.quantity && !values.unitPrice)
  )
    return [];
  if (!values.type) {
    const title = normalize(text.split(/\r?\n/).slice(0, 3).join(" "));
    if (/comprovante de compra\b/.test(title)) values.type = "compra";
    else if (/comprovante de venda\b/.test(title)) values.type = "venda";
  }
  if (
    !values.broker &&
    /\bnubank\b|\bnu invest\b|\bnuinvest\b/.test(normalized)
  )
    values.broker = "Nubank";
  return [draft(values, 0, text)];
}

function parseTextTable(text: string): ImportDraftRow[] {
  // Preserve real column boundaries; ordinary prose and single spaces do not qualify.
  const table = text
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s*\|\s*|\t+|\s{2,}/));
  return parseTable(table);
}

export function parseImportDocument(document: ImportDocument): {
  rows: ImportDraftRow[];
  warnings: string[];
} {
  if ((document.text?.length ?? 0) > IMPORT_LIMITS.characters)
    throw new Error("O documento excede o limite de texto para importação.");
  const normalizedText = normalize(document.text ?? "");
  if (
    !document.table &&
    /\b(?:cancelad[ao]s?|rejeitad[ao]s?|recusad[ao]s?|agendad[ao]s?|pendente[s]?)\b|\b(?:aguardando|em espera de) (?:a )?execucao\b|\bnao executad[ao]\b/.test(
      normalizedText,
    )
  ) {
    return {
      rows: [],
      warnings: [
        ...document.warnings,
        "O documento indica uma ordem pendente, agendada, cancelada ou rejeitada. Importe o comprovante de negociação executada para registrar uma compra ou venda real.",
      ],
    };
  }
  const tableRows = document.table
    ? parseTable(document.table)
    : parseTextTable(document.text ?? "");
  const rows = tableRows.length
    ? tableRows
    : document.table
      ? []
      : parseReceipt(document.text ?? "");
  const warnings = [...document.warnings];
  if (!rows.length)
    warnings.push(
      "Não foi possível reconhecer operações com segurança. Use um comprovante de negociação com ativo, quantidade e preço, ou registre a operação manualmente.",
    );
  if (
    rows.some(
      (row) =>
        !row.symbol ||
        !row.tradeDate ||
        !row.type ||
        !row.quantity ||
        !row.unitPrice,
    )
  )
    warnings.push(
      "Há campos ausentes ou ambíguos. Complete e confira os dados no documento antes de salvar.",
    );
  if (rows.some((row) => !row.feesConfirmed))
    warnings.push(
      "Os custos não foram identificados por operação. Confira o documento e informe os custos, inclusive zero quando for o caso.",
    );
  if (rows.some((row) => !row.arcaClass))
    warnings.push(
      "Confirme o tipo e o grupo dos ativos que não estão no catálogo verificado.",
    );
  return { rows, warnings: [...new Set(warnings)] };
}
