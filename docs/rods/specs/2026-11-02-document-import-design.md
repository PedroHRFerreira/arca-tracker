# Importação de comprovantes e notas de negociação

Escopo confirmado pela pessoa: compra na instituição, envio do documento ao ARCA, conferência e cadastro na categoria correta. Não é preciso comprar um ativo nem fornecer um extrato pessoal para desenvolver o fluxo. Somente soluções sem mensalidade; nenhuma sincronização sem acesso oficial disponível deve aparecer no produto.

## Entrega

- Entrada pela Carteira: importar PDF com texto, CSV ou Excel de negociações de ações, FIIs e ETFs. Comprovantes de conta corrente, PIX, posições consolidadas, derivativos e imagens sem texto não são interpretados como compras.
- Leitura local no aparelho e navegador, sem transmitir o documento. Limites de tamanho, páginas e operações, rejeição clara de documentos incompatíveis/protegidos.
- Revisão editável com ativo, data, compra/venda, quantidade, preço e taxas. A ausência de taxas exige confirmação explícita de zero ou preenchimento; nenhuma taxa é estimada.
- Catálogo verificado identifica os grupos quando conhecido; ativos desconhecidos exigem classificação explícita. Nenhum ETF é considerado internacional apenas pelo formato do código.
- Salvar somente após validação/revisão. Exibir quantidades novas e já registradas, impedir duplicações por reimportação e gravar o lote atomicamente, sem alterar reserva ou carteira existente.
- Histórico de compras integra o cálculo atual, e cotações atuais continuam sendo consultadas pelo proxy existente. O preço histórico do comprovante não deve substituir uma cotação mais recente.
- Novos dados de deduplicação devem sobreviver a backup/restauração, preservando backups anteriores.

## Verificação

Testes de parsing de documentos demonstrativos, valores brasileiros, linhas ambíguas, CSV com aspas, Excel e PDF com texto. SQLite real em memória verifica lote atômico, vendas sem posição, datas, duplicação/multiplicidade e backup. Revisão em navegador real e exportação Android; compilação nativa necessária para o módulo local de leitura de PDF. Não anunciar leitura universal de qualquer PDF nem sincronização com bancos.
