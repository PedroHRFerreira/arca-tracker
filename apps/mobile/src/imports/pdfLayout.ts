import { IMPORT_LIMITS } from "./types";

interface PdfTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

/** Keeps proven visual gaps as column boundaries; it does not interpret trades. */
export function pdfItemsToText(items: PdfTextItem[]): string {
  const lines: { y: number; items: PdfTextItem[] }[] = [];
  const bands = new Map<number, typeof lines>();
  let characters = 0;
  for (const item of items) {
    if (!item.str.trim()) continue;
    characters += item.str.length;
    if (characters > IMPORT_LIMITS.characters)
      throw new Error(
        "O PDF contém texto demais. Divida o extrato em arquivos menores.",
      );
    const y = item.transform[5];
    const band = Math.floor(y / 3);
    const line = [band - 1, band, band + 1]
      .flatMap((key) => bands.get(key) ?? [])
      .find((candidate) => Math.abs(candidate.y - y) <= 3);
    if (line) line.items.push(item);
    else {
      const entry = { y, items: [item] };
      lines.push(entry);
      bands.set(band, [...(bands.get(band) ?? []), entry]);
    }
  }
  let text = "";
  for (const line of lines.sort((left, right) => right.y - left.y)) {
    let previous: PdfTextItem | undefined;
    for (const item of line.items.sort(
      (left, right) => left.transform[4] - right.transform[4],
    )) {
      if (previous) {
        const gap =
          item.transform[4] - (previous.transform[4] + previous.width);
        const columnGap = Math.max(
          8,
          Math.max(item.height, previous.height) * 0.8,
        );
        if (gap >= columnGap) text = text.trimEnd() + "  ";
        else if (gap > 0.6 && !/\s$/.test(text) && !/^\s/.test(item.str))
          text += " ";
      }
      text += item.str;
      if (text.length > IMPORT_LIMITS.characters)
        throw new Error(
          "O PDF contém texto demais. Divida o extrato em arquivos menores.",
        );
      previous = item;
    }
    text += "\n";
  }
  return text;
}
