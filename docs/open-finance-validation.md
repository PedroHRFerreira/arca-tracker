# Validação da conexão pessoal — 02/11/2026

## Automatizada

- 150 testes: domínio 60, aplicativo 63, serviço privado 19, cotações 8. Checagem de tipos dos quatro pacotes concluída.
- Cobertura: contratos estritos, valores decimais, origem privada, autorização obrigatória, IDs permitidos, respostas sem credenciais, dados faltantes, resgates totais, execução diferente da liquidação, custos parciais, paginação/truncamento, falha de investimentos/histórico, cache de conexão com erro, timeout e desconexão durante consulta.
- SQLite: importação atômica e concorrente, duplicata de documento/manual, operação corrigida, registro vinculado alterado/removido, backup antigo e atual. Posições e saldos não geram operações.
- Abertura Android: testes do adaptador e plugin de visibilidade dos dois pacotes oficiais, sem permissão ampla de consultar aplicativos.
- Exportação JavaScript Android concluída. O build remoto do APK é uma verificação adicional, registrada na entrega.

## Serviço publicado e dados reais

Serviço privado autenticado publicado separadamente do proxy de cotações. Consulta real retornou duas conexões atualizadas, Nubank e Mercado Pago, com três contas/cartões no total. Não havia posições ativas nem operações novas nessa consulta. Aplicações totalmente resgatadas foram reconhecidas e omitidas das posições atuais; suas operações permanecem disponíveis para revisão. Teste de integração SQLite confirma compra seguida de venda total, saldo de quantidade zero e deduplicação na repetição. Nenhum valor financeiro, identificador de conta ou credencial foi gravado neste relatório. Sem chave ou com chave inválida, o serviço retornou 401. Cache privado `no-store` confirmado.

Uma consulta estrutural adicional ao histórico de um investimento resgatado retornou duas operações com datas de execução e liquidação e componentes de custo ausentes. Esse histórico foi separado das posições atuais e não foi registrado na carteira. Custos nulos continuam desconhecidos e dependem de conferência.

Essa consulta valida autenticação, permissões e leitura das conexões reais. Não comprova execução ou sincronização de uma nova compra de ação, pois nenhuma compra foi realizada para o teste.

## Navegador

Interface local em `http://localhost:8084/banks`, serviço temporário isolado com dados sintéticos em 8085. Chave inválida recusada; chave de teste conectou duas instituições. Saldos de conta e cartão separados, nenhuma compra criada, revisão vazia compreensível. Interrupção do serviço mostrou erro com cache preservado. Conferência em 320 × 700 sem elementos excedendo a largura; prova visual em arquivo temporário, sem dados reais. O ambiente sintético não integra o produto ou o APK. O fluxo guiado foi percorrido até a revisão, com valores fictícios; o exemplo Tesouro Selic exibiu finalidade, riscos, custos e instruções oficiais do Nubank, sem botão de abertura nativa na web. O plano fictício não foi ativado. Depois do ajuste de venda total, a revisão mostrou a compra e a venda de uma aplicação sintética resgatada, sem tratá-la como posição atual. As duas operações foram confirmadas somente no ambiente fictício em 8084; a tela passou a indicar zero novas e duas já registradas. Nenhuma movimentação real de banco foi feita. Corrigido o preenchimento automático indevido de senha pelo navegador; depois de desconectar, o campo da chave permanece vazio e o botão fica desabilitado.

## Conferência física pendente

Não há Android físico conectado. Abrir de fato Nubank/Mercado Pago instalados, teclado nativo, fontes ampliadas, notificações e primeira compra real devem ser conferidos no celular do titular. Testes do adaptador e compilação não comprovam abertura real de outro app ou entrega de notificação. A chave pessoal é configurada uma vez em Meus bancos; a carteira anterior permanece no SQLite ao instalar a atualização por cima.
