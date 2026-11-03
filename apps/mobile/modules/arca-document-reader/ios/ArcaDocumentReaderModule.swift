import ExpoModulesCore
import PDFKit

public class ArcaDocumentReaderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ArcaDocumentReader")
    AsyncFunction("extractText") { (uri: String) -> String in
      guard let url = URL(string: uri), url.isFileURL else { throw ReaderError("Selecione um arquivo local do aparelho.") }
      let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
      guard size > 0 && size <= 10 * 1024 * 1024 else { throw ReaderError("O PDF deve ter até 10 MB e não pode estar vazio.") }
      guard let document = PDFDocument(url: url) else { throw ReaderError("Não foi possível ler este PDF.") }
      guard !document.isEncrypted && !document.isLocked && document.allowsCopying else { throw ReaderError("Use um PDF sem senha e sem proteção.") }
      guard document.pageCount <= 100 else { throw ReaderError("O PDF tem mais de 100 páginas. Divida o extrato em arquivos menores.") }
      var text = ""
      for index in 0..<document.pageCount {
        let pageText = document.page(at: index)?.string ?? ""
        guard pageText.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 else { throw ReaderError("O PDF contém página sem texto selecionável. Use o arquivo original, sem digitalização, ou registre a operação manualmente.") }
        text += pageText + "\n"
        guard text.count <= 500000 else { throw ReaderError("O PDF contém texto demais. Divida o extrato em arquivos menores.") }
      }
      guard text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 10 else { throw ReaderError("Este PDF não tem texto selecionável. PDFs digitalizados ou fotografias precisam de registro manual.") }
      return text
    }
  }
}

private struct ReaderError: LocalizedError {
  let reason: String
  init(_ reason: String) { self.reason = reason }
  var errorDescription: String? { "ARCA_PDF: " + reason }
}
