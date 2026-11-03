import { IMPORT_LIMITS, type ImportAsset } from "./types";
import { pdfItemsToText } from "./pdfLayout";

export async function readDocumentBytes(
  asset: ImportAsset,
): Promise<Uint8Array> {
  if (asset.file) {
    if (asset.file.size > IMPORT_LIMITS.bytes)
      throw new Error(
        "O arquivo ultrapassa 10 MB. Divida o extrato em arquivos menores.",
      );
    return new Uint8Array(await asset.file.arrayBuffer());
  }
  if (!asset.uri.startsWith("blob:") && !asset.uri.startsWith("data:"))
    throw new Error("Selecione um arquivo do seu aparelho para importar.");
  const response = await fetch(asset.uri);
  if (!response.ok)
    throw new Error("Não foi possível abrir o arquivo selecionado.");
  return new Uint8Array(await response.arrayBuffer());
}

export async function readPdfText(
  _asset: ImportAsset,
  bytes: Uint8Array,
): Promise<string> {
  // PDF.js is already an ES module with top-level await. Serve it locally
  // without wrapping it in Metro's synchronous module factory.
  const moduleUrl = new URL("/pdf-reader.mjs", window.location.href).href;
  const pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs") = await import(
    /* @metro-ignore */ moduleUrl
  );
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: bytes,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
  });
  // A password prompt must fail locally instead of waiting indefinitely.
  task.onPassword = () => {
    void task.destroy();
  };
  try {
    const document = await task.promise;
    if ((await document.getPermissions()) !== null)
      throw new Error("Use um PDF sem senha e sem proteção.");
    if (document.numPages > IMPORT_LIMITS.pages)
      throw new Error(
        "O PDF tem mais de 100 páginas. Divida o extrato em arquivos menores.",
      );
    let text = "";
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      if (
        content.items
          .filter((item) => "str" in item)
          .map((item) => ("str" in item ? item.str : ""))
          .join("")
          .trim().length < 10
      )
        throw new Error(
          "O PDF contém página sem texto selecionável. Use o arquivo original, sem digitalização, ou registre a operação manualmente.",
        );
      text += pdfItemsToText(content.items.filter((item) => "str" in item));
      if (text.length > IMPORT_LIMITS.characters)
        throw new Error(
          "O PDF contém texto demais. Divida o extrato em arquivos menores.",
        );
      page.cleanup();
    }
    if (text.trim().length < 10)
      throw new Error(
        "Este PDF não tem texto selecionável. PDFs digitalizados ou fotografias precisam de registro manual.",
      );
    return text;
  } catch (error) {
    if (
      error instanceof Error &&
      /senha|100 páginas|texto demais|selecionável/.test(error.message)
    )
      throw error;
    throw new Error(
      "Não foi possível ler este PDF. Use um arquivo com texto selecionável, sem senha e sem proteção.",
    );
  } finally {
    await task.destroy();
  }
}
