import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
vi.mock("../src/imports/reader", () => ({
  readDocumentBytes: vi.fn(),
  readPdfText: vi.fn(),
}));
import {
  parseCsv,
  parseImportDate,
  parseImportDocument,
  parseImportNumber,
} from "../src/imports/parser";
import {
  assertDocumentSize,
  decodeCsvText,
  readImportDocument,
  readSpreadsheet,
} from "../src/imports/document";
import { pdfItemsToText } from "../src/imports/pdfLayout";
import { readDocumentBytes, readPdfText } from "../src/imports/reader";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/imports/${name}`, import.meta.url), "utf8");

describe("local document interpretation", () => {
  it("reads known receipt labels on separate lines or separated by visual column gaps", () => {
    const expected = {
      symbol: "PETR4",
      tradeDate: "2026-11-02",
      type: "BUY",
      quantity: "3",
      unitPrice: "32.45",
      fees: "0.05",
    };
    const text = fixture("receipt-separate-labels.txt");
    expect(
      parseImportDocument({ text, fileName: "compra.pdf", warnings: [] })
        .rows[0],
    ).toMatchObject(expected);
    const aligned =
      "Comprovante de compra\nCódigo do ativo  PETR4\nData da compra  02/11/2026\nTipo de operação  Compra\nQuantidade executada  3\nPreço médio  32,45\nCustos  0,05";
    expect(
      parseImportDocument({
        text: aligned,
        fileName: "compra.pdf",
        warnings: [],
      }).rows[0],
    ).toMatchObject(expected);
    const missing =
      "Comprovante de compra\nAtivo\nPETR4\nQuantidade\nPreço\n32,45";
    expect(
      parseImportDocument({
        text: missing,
        fileName: "compra.pdf",
        warnings: [],
      }).rows[0].quantity,
    ).toBe("");
  });
  it("does not suggest a real trade for explicit pending, cancelled, scheduled or rejected orders", () => {
    for (const text of [
      fixture("order-pending.txt"),
      ...[
        "Pendente",
        "Cancelada",
        "Agendada",
        "Rejeitada",
        "Não executada",
      ].map(
        (status) =>
          `Comprovante de compra\nStatus: ${status}\nAtivo: PETR4\nQuantidade: 3\nPreço: 32,45`,
      ),
    ]) {
      const result = parseImportDocument({
        text,
        fileName: "ordem.pdf",
        warnings: [],
      });
      expect(result.rows).toHaveLength(0);
      expect(result.warnings[0]).toContain("ordem pendente");
    }
  });
  it("preserves proven PDF column gaps while joining adjacent fragments and ordinary words", () => {
    const item = (str: string, x: number, y: number, width: number) => ({
      str,
      width,
      height: 12,
      transform: [12, 0, 0, 12, x, y],
    });
    const text = pdfItemsToText([
      item("unitário", 86, 100, 40),
      item("32,45", 210, 100, 30),
      item("Preço", 50, 100, 32),
      item("PETR", 50, 80, 27),
      item("4", 77, 80, 7),
    ]);
    expect(text).toBe("Preço unitário  32,45\nPETR4\n");
  });
  it("decodes Windows-1252 CSV locally without requiring TextDecoder legacy encodings", () => {
    const bytes = Uint8Array.from(
      [..."Pre"]
        .map((char) => char.charCodeAt(0))
        .concat([0xe7, 0x6f, 0x3b, 0x80]),
    );
    expect(decodeCsvText(bytes)).toBe("Preço;€");
    expect(decodeCsvText(new TextEncoder().encode("Preço;R$"))).toBe(
      "Preço;R$",
    );
  });
  it("reads an explicit receipt without inferring data from company names", () => {
    const result = parseImportDocument({
      text: fixture("receipt.txt"),
      fileName: "compra.pdf",
      warnings: [],
    });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      symbol: "PETR4",
      quantity: "3",
      unitPrice: "32.45",
      tradeDate: "2026-11-02",
      type: "BUY",
      fees: "0.05",
      feesConfirmed: true,
      arcaClass: "BRAZIL_STOCKS",
      assetType: "EQUITY",
      broker: "Nubank",
    });
    const unknown = parseImportDocument({
      text: "Comprovante de compra\nNome do ativo: Empresa ABC\nQuantidade: 2\nPreço: 25,00",
      fileName: "nota.pdf",
      warnings: [],
    });
    expect(unknown.rows[0].symbol).toBe("");
    expect(unknown.rows[0].feesConfirmed).toBe(false);
    expect(unknown.rows[0].arcaClass).toBeNull();
  });
  it("reads B3 trade tables, handles fractional execution, and keeps unavailable costs blank", () => {
    const result = parseImportDocument({
      table: parseCsv(fixture("b3.csv")),
      fileName: "B3.csv",
      warnings: [],
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      symbol: "BOVA11",
      arcaClass: "BRAZIL_STOCKS",
      assetType: "ETF",
      unitPrice: "125.30",
      fees: "",
      feesConfirmed: false,
    });
    expect(result.rows[1]).toMatchObject({
      symbol: "PETR4",
      type: "SELL",
      tradeDate: "2026-11-03",
    });
  });
  it("does not guess fund type from a ticker ending in 11", () => {
    const { rows } = parseImportDocument({
      text: "Comprovante de compra\nAtivo: XXXX11\nQuantidade: 2\nPreço: 10,00",
      fileName: "compra.pdf",
      warnings: [],
    });
    expect(rows[0]).toMatchObject({ arcaClass: null, assetType: null });
  });
  it("supports quoted delimiters, escaped quotes and line breaks in CSV cells", () => {
    expect(
      parseCsv(
        'Ativo;Nome;Quantidade;Preço\r\nPETR4;"Petrobras; \"\"PN\"\"\nBrasil";2;32,45',
      ),
    ).toEqual([
      ["Ativo", "Nome", "Quantidade", "Preço"],
      ["PETR4", 'Petrobras; "PN"\nBrasil', "2", "32,45"],
    ]);
    expect(() => parseCsv('Ativo;"aspas abertas')).toThrow("aspas abertas");
  });
  it("rejects ordinary account movement, ambiguous combined receipts, and unstructured prose", () => {
    for (const text of [
      "Comprovante Pix\nData: 02/11/2026\nValor: R$ 125,00\nFavorecido: Nu Invest",
      "Comprovante de compra\nAtivo: PETR4\nQuantidade: 2\nAtivo: BOVA11\nQuantidade: 3\nPreço: 10,00",
      "Comprei PETR4 ontem e acho que paguei 20 reais",
    ]) {
      expect(
        parseImportDocument({ text, fileName: "documento.pdf", warnings: [] })
          .rows,
      ).toHaveLength(0);
    }
  });
  it("preserves column-aligned PDF tables when the extraction has clear boundaries", () => {
    const result = parseImportDocument({
      text: "Data | C/V | Ativo | Quantidade | Preço\n02/11/2026 | C | PETR4 | 2 | 32,45",
      fileName: "nota.pdf",
      warnings: [],
    });
    expect(result.rows[0]).toMatchObject({
      symbol: "PETR4",
      tradeDate: "2026-11-02",
      quantity: "2",
      unitPrice: "32.45",
      type: "BUY",
    });
  });
  it("leaves malformed dates and ambiguous or negative numbers for explicit review", () => {
    expect(parseImportDate("31/02/2026")).toBe("");
    expect(parseImportDate("2024-02-29")).toBe("2024-02-29");
    for (const value of ["1.234", "-1", "NaN", "1,2,3", "1e3", "1.2.3"])
      expect(parseImportNumber(value)).toBe("");
    expect(parseImportNumber("R$ 1.234,56")).toBe("1234.56");
  });
  it("reads a real XLSX archive with numeric cells and serial dates without confusing totals with unit prices", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["Data", "Ativo", "Operação", "Quantidade", "Preço", "Valor"],
        [46328, "PETR4", "Compra", 3, 32.45, 97.35],
      ]),
      "Negócios",
    );
    const archive = new Uint8Array(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }),
    );
    const table = readSpreadsheet(archive);
    const { rows } = parseImportDocument({
      table,
      fileName: "compras.xlsx",
      warnings: [],
    });
    expect(rows[0]).toMatchObject({
      tradeDate: "2026-11-02",
      quantity: "3",
      unitPrice: "32.45",
    });
    vi.mocked(readDocumentBytes).mockResolvedValue(archive);
    const document = await readImportDocument({
      uri: "file:///compras.xlsx",
      name: "compras.xlsx",
    });
    expect(parseImportDocument(document).rows[0]).toMatchObject({
      symbol: "PETR4",
      tradeDate: "2026-11-02",
      quantity: "3",
      unitPrice: "32.45",
    });
  });
  it("checks size and actual format before calling PDF extraction", async () => {
    expect(() => assertDocumentSize(0)).toThrow("vazio");
    expect(() => assertDocumentSize(10 * 1024 * 1024 + 1)).toThrow("10 MB");
    vi.mocked(readDocumentBytes).mockResolvedValue(
      new TextEncoder().encode("não sou PDF"),
    );
    await expect(
      readImportDocument({ uri: "file:///x", name: "falso.pdf" }),
    ).rejects.toThrow("válido");
    expect(readPdfText).not.toHaveBeenCalled();
    vi.mocked(readDocumentBytes).mockResolvedValue(
      new TextEncoder().encode("%PDF-1.7"),
    );
    vi.mocked(readPdfText).mockRejectedValue(
      new Error("Este PDF não tem texto selecionável."),
    );
    await expect(
      readImportDocument({ uri: "file:///x", name: "scan.pdf" }),
    ).rejects.toThrow("selecionável");
  });
});
