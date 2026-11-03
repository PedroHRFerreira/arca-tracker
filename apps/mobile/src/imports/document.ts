import * as XLSX from "xlsx";
import { parseCsv } from "./parser";
import { readDocumentBytes, readPdfText } from "./reader";
import { IMPORT_LIMITS, type ImportAsset, type ImportDocument } from "./types";

export function assertDocumentSize(size: number): void {
  if (size > IMPORT_LIMITS.bytes)
    throw new Error(
      "O arquivo ultrapassa 10 MB. Divida o extrato em arquivos menores.",
    );
  if (size <= 0) throw new Error("O arquivo está vazio.");
}

export function decodeCsvText(bytes: Uint8Array): string {
  const text = new TextDecoder("utf-8").decode(bytes);
  if (!text.includes("\ufffd")) return text;
  // Hermes may only implement UTF-8. Decode Windows-1252 locally without a polyfill.
  const extras: Record<number, number> = {
    128: 0x20ac,
    130: 0x201a,
    131: 0x192,
    132: 0x201e,
    133: 0x2026,
    134: 0x2020,
    135: 0x2021,
    136: 0x2c6,
    137: 0x2030,
    138: 0x160,
    139: 0x2039,
    140: 0x152,
    142: 0x17d,
    145: 0x2018,
    146: 0x2019,
    147: 0x201c,
    148: 0x201d,
    149: 0x2022,
    150: 0x2013,
    151: 0x2014,
    152: 0x2dc,
    153: 0x2122,
    154: 0x161,
    155: 0x203a,
    156: 0x153,
    158: 0x17e,
    159: 0x178,
  };
  return Array.from(bytes, (byte) =>
    String.fromCodePoint(extras[byte] ?? byte),
  ).join("");
}

export function readSpreadsheet(bytes: Uint8Array): string[][] {
  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: false,
    sheetRows: IMPORT_LIMITS.rows + 22,
    cellFormula: false,
    cellHTML: false,
    bookVBA: false,
  });
  const populated = workbook.SheetNames.filter(
    (name) => workbook.Sheets[name]?.["!ref"],
  );
  if (populated.length !== 1)
    throw new Error(
      "Envie uma planilha com apenas uma aba preenchida para evitar omitir operações.",
    );
  const sheet = workbook.Sheets[populated[0]];
  if (sheet["!ref"] && XLSX.utils.decode_range(sheet["!ref"]).e.c > 99)
    throw new Error(
      "A planilha tem colunas demais. Exporte somente os dados das operações, com até 100 colunas.",
    );
  if (sheet["!fullref"]) {
    const range = XLSX.utils.decode_range(sheet["!fullref"]);
    if (range.e.r > IMPORT_LIMITS.rows + 20)
      throw new Error("Importe no máximo 500 operações por arquivo.");
  }
  const table = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
  const dateColumns = new Set<number>();
  for (const row of table.slice(0, 20))
    row.forEach((cell, column) => {
      if (/^data(?:\s|$)/i.test(String(cell).trim())) dateColumns.add(column);
    });
  return table.map((row) =>
    row.map((cell, column) => {
      if (typeof cell === "number" && dateColumns.has(column)) {
        const parsed = XLSX.SSF.parse_date_code(cell, {
          date1904: workbook.Workbook?.WBProps?.date1904,
        });
        if (parsed && parsed.y >= 1990 && parsed.y <= 2100)
          return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
      }
      return String(cell);
    }),
  );
}

export async function readImportDocument(
  asset: ImportAsset,
): Promise<ImportDocument> {
  if (asset.size !== undefined) assertDocumentSize(asset.size);
  const bytes = await readDocumentBytes(asset);
  assertDocumentSize(bytes.byteLength);
  const extension = asset.name.split(".").pop()?.toLowerCase();
  const pdf =
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
  const spreadsheet =
    (bytes[0] === 0x50 && bytes[1] === 0x4b) ||
    (bytes[0] === 0xd0 && bytes[1] === 0xcf);
  if (extension === "pdf" && pdf)
    return {
      fileName: asset.name,
      warnings: [],
      text: await readPdfText(asset, bytes),
    };
  if (["xlsx", "xls"].includes(extension ?? "") && spreadsheet) {
    try {
      return {
        fileName: asset.name,
        warnings: [],
        table: readSpreadsheet(bytes),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        /aba preenchida|500 operações|colunas demais/.test(error.message)
      )
        throw error;
      throw new Error(
        "Não foi possível ler a planilha. Verifique se é Excel válido e sem senha.",
      );
    }
  }
  if (extension === "csv" && !pdf && !spreadsheet) {
    if (bytes.includes(0))
      throw new Error(
        "O arquivo não é um CSV de texto. Salve a planilha como CSV UTF-8.",
      );
    const text = decodeCsvText(bytes);
    return { fileName: asset.name, warnings: [], table: parseCsv(text) };
  }
  throw new Error(
    "Selecione um PDF, CSV, XLS ou XLSX válido. Imagens e arquivos protegidos não são aceitos.",
  );
}
