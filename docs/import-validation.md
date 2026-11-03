# Validação da importação de investimentos — 2 de novembro de 2026

## Escopo e limites

CSV/Excel de negociações e PDF com texto selecionável e campos estruturados. A leitura é local, sem serviços de IA ou upload de documentos. Somente compras/vendas de ações, ETFs e FIIs são cadastradas. PDFs de imagem, protegidos ou sem um layout reconhecido são recusados com alternativa de registro manual. Não há alegação de compatibilidade universal com documentos de bancos; nenhum documento pessoal foi necessário para desenvolver os exemplos demonstrativos.

Os campos reconhecidos são editáveis e exigem confirmação de negociações realizadas. Custos desconhecidos não são presumidos. O catálogo permite classificar ativos conhecidos e os demais exigem escolha explícita de tipo/grupo. ETF não é considerado internacional pelo sufixo do ticker.

## Verificações já executadas

- Checagem de tipos de domínio, mobile e proxy passou.
- 79 testes passaram: 37 domínio, 34 mobile, 8 proxy.
- Testes incluem parsing de PDF estruturado, CSV escapado/Windows-1252, XLSX real, ordem não executada, precisão, duplicatas por multiplicidade, corretoras distintas, colisões com registros manuais, rollback, cronologia e backup/restauração.
- Exportação JavaScript Android passou com 1.584 módulos.
- Autolinking Android reconheceu ArcaDocumentReader; o arquivo enviado ao EAS inclui Kotlin e Swift do módulo local, após corrigir as exceções do .gitignore.
- Chromium, localhost:8084: envio real de PDF sintético pelo seletor, extração de PETR4 (3 unidades, R$ 32,45, custos R$ 0,05), categoria Ações Brasil, revisão, confirmação e cadastro com valor de R$ 97,35. Nenhum erro de execução no fluxo corrigido. A reimportação do mesmo PDF foi confirmada no navegador: zero operações novas, uma duplicata ignorada, preservando a carteira. Tela de confirmação em 390 px sem transbordamento horizontal.
- A integração inicial de PDF.js com a divisão de módulos do Metro falhou no navegador. Corrigido carregando os módulos ES originais localmente, via recurso documentado @metro-ignore. postinstall gera o leitor e worker da mesma versão, sem CDN.
- CSV no seletor real: BOVA11 foi reconhecido como ETF brasileiro; custos ausentes exigiram preenchimento ou confirmação explícita de zero. Data futura foi bloqueada. Excluir a linha inválida permitiu prévia de apenas uma operação, sem salvar o lote de teste.
- XLSX real no seletor: planilha demonstrativa com BOVA11 (2 unidades a R$ 125,30, custos R$ 0,05, Nu Invest) chegou à prévia de uma operação nova; tipo ETF e grupo Ações foram preenchidos corretamente. Sem salvar esse lote demonstrativo.
- Extrato de conta com PIX e colunas Data/Descrição/Valor foi recusado sem gerar operações, com registro manual disponível.
- Campos em largura de 320 px e confirmação em 390 px ficaram dentro da tela, sem transbordamento horizontal. Os dados demonstrativos foram usados em uma origem local de testes separada da prévia original.

## Validação nativa

A exportação JavaScript não confirma a compilação Kotlin/Swift nem uma instalação física. A compilação do APK e conferência em aparelho precisam ser registradas separadamente. O APK 0.2.0 anterior não possui o novo módulo de PDF.

Compilação 0.3.0 (versionCode 3): [EAS 54fe6421](https://expo.dev/accounts/pedrohrferreira/projects/arca-tracker/builds/54fe6421-1813-48b8-b5fa-2c90fed96cba), iniciada com o commit `6cc9238`. Resultado nativo pendente. Não há aparelho Android ou iOS conectado para validar instalação, seletor nativo ou permissões nesta sessão.

O [estudo de Open Finance](./open-finance-assessment.md) é uma avaliação separada; não adiciona uma integração bancária ao app.
