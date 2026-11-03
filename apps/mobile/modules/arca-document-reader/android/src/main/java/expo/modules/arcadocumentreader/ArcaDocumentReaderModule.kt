package expo.modules.arcadocumentreader

import android.net.Uri
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import java.io.ByteArrayOutputStream

class ArcaDocumentReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ArcaDocumentReader")
    AsyncFunction("extractText") { uri: String ->
      val context = appContext.reactContext ?: throw Exception("ARCA_CONTEXT: Reinicie o aplicativo e tente novamente.")
      val localUri = Uri.parse(uri)
      require(localUri.scheme == "file" || localUri.scheme == "content") { "ARCA_URI: Selecione um arquivo local do aparelho." }
      PDFBoxResourceLoader.init(context)
      val bytes = context.contentResolver.openInputStream(localUri)?.use { input ->
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          require(output.size() + count <= 10 * 1024 * 1024) { "ARCA_SIZE: O arquivo ultrapassa 10 MB." }
          output.write(buffer, 0, count)
        }
        output.toByteArray()
      } ?: throw Exception("ARCA_FILE: Não foi possível abrir o arquivo selecionado.")
      PDDocument.load(bytes).use { document ->
        require(!document.isEncrypted) { "ARCA_PROTECTED: Use um PDF sem senha e sem proteção." }
        require(document.numberOfPages <= 100) { "ARCA_PAGES: O PDF tem mais de 100 páginas. Divida o extrato em arquivos menores." }
        require(document.currentAccessPermission.canExtractContent()) { "ARCA_PROTECTED: Este PDF não permite extrair o texto." }
        val stripper = PDFTextStripper()
        stripper.sortByPosition = true
        val text = StringBuilder()
        for (page in 1..document.numberOfPages) {
          stripper.startPage = page
          stripper.endPage = page
          val pageText = stripper.getText(document)
          require(pageText.trim().length >= 10) { "ARCA_SCAN: O PDF contém página sem texto selecionável. Use o arquivo original, sem digitalização, ou registre a operação manualmente." }
          text.append(pageText).append('\n')
          require(text.length <= 500000) { "ARCA_TEXT: O PDF contém texto demais. Divida o extrato em arquivos menores." }
        }
        require(text.toString().trim().length >= 10) { "ARCA_SCAN: Este PDF não tem texto selecionável. PDFs digitalizados ou fotografias precisam de registro manual." }
        text.toString()
      }
    }.runOnQueue(CoroutineScope(Dispatchers.IO))
  }
}
