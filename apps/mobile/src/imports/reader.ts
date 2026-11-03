import { File as LocalFile } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { IMPORT_LIMITS, type ImportAsset } from "./types";

export async function readDocumentBytes(
  asset: ImportAsset,
): Promise<Uint8Array> {
  if (!/^file:|^content:/.test(asset.uri))
    throw new Error("Selecione um arquivo local do aparelho.");
  const file = new LocalFile(asset.uri);
  if (file.size > IMPORT_LIMITS.bytes)
    throw new Error(
      "O arquivo ultrapassa 10 MB. Divida o extrato em arquivos menores.",
    );
  return new Uint8Array(await file.arrayBuffer());
}

export async function readPdfText(
  asset: ImportAsset,
  _bytes: Uint8Array,
): Promise<string> {
  const module = requireOptionalNativeModule<{
    extractText(uri: string): Promise<string>;
  }>("ArcaDocumentReader");
  if (!module)
    throw new Error(
      "A leitura local de PDF precisa da versão atualizada do aplicativo. Instale o novo APK; a versão antiga e o Expo Go não incluem este leitor.",
    );
  try {
    return await module.extractText(asset.uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ARCA_"))
      throw new Error(message.replace(/^.*?ARCA_[A-Z_]+:\s*/, ""));
    throw new Error(
      "Não foi possível ler este PDF. Use um arquivo com texto selecionável, sem senha, de até 100 páginas.",
    );
  }
}
