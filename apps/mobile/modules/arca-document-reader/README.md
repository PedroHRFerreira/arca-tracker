# Leitor local de documentos ARCA

Este módulo extrai texto selecionável usando PDFBox Android e PDFKit iOS. Não faz upload, OCR, consulta à corretora ou leitura de PDF com senha/proteção.

O parser interpreta rótulos conhecidos com valor na mesma linha ou na linha seguinte. Tabelas exigem separadores preservados pela extração. PDFBox/PDFKit podem perder alinhamento de colunas dependendo de como o emissor gerou o arquivo; uma nota de negociação que mostra apenas o nome da empresa não será convertida automaticamente em ticker. O suporte não representa compatibilidade universal com extratos Nubank ou outras instituições.

Arquivos ou layouts que não permitem identificar operações com segurança são recusados. Todos os dados identificados passam pela revisão do usuário antes de salvar.

Limites: arquivo 10 MB, PDF 100 páginas, texto 500 mil caracteres e 500 operações. Uma página sem texto selecionável impede a importação do PDF inteiro, evitando importar somente parte de um documento misto.

O módulo precisa estar incluído em um novo build nativo. Expo Go e APKs anteriores não ganham o leitor por atualização de JavaScript.
