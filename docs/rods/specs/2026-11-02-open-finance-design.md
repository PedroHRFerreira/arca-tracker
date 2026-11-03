# Integração pessoal Meu Pluggy no ARCA

Escopo autorizado pelo usuário em 02/11/2026: implementar, validar e gerar novo APK para seu uso pessoal, mantendo ausência de mensalidade. O usuário também pediu sugestões compatíveis com orçamento e encaminhamento ao banco para concluir a compra. O acesso de leitura às contas Nubank e Mercado Pago pela aplicação pessoal foi confirmado durante a configuração.

## Fluxo e limites

- Backend privado separado do proxy público de cotações. Credenciais Pluggy e IDs das conexões ficam em segredos do servidor; a chave pessoal do app fica no SecureStore, nunca no APK, SQLite ou backup.
- Acesso por endpoints de leitura, somente às conexões pessoais configuradas no servidor. Sem endpoint de pagamentos, envio de ordens, exclusão de conta bancária ou consulta arbitrária de outra conexão.
- Atualizar dados ao abrir/revisitar a tela e sob demanda. O Meu Pluggy atualiza a origem diariamente; o aplicativo não agenda atualizações manuais do provedor nem promete tempo real.
- Saldos de conta, crédito e posições do banco aparecem separados da carteira registrada no ARCA. Posições não são convertidas em compras e não são somadas à carteira estratégica.
- Operações completas de ações, ETFs e FIIs conhecidos podem ser revisadas/importadas, usando IDs externos e identidade econômica para evitar duplicatas. Correções do provedor exigem revisão. Sincronização automática da carteira exige opção explícita; dados incompletos permanecem pendentes.
- Manter contexto de despesas, objetivos, dívidas e reserva do plano. Entradas bancárias não são automaticamente consideradas salário nem saldo de cartão é tratado como dinheiro disponível para aporte.
- Nos exemplos de investimento, mostrar instituições compatíveis por família, com fonte e ressalva de confirmação de disponibilidade pelo banco. Abrir app Android instalado e oferecer instruções oficiais separadas quando necessário. Sem promessa de catálogo de ofertas completo ou ordem preenchida.

## Aceitação

Validar contratos e decimais, paginação e falhas parciais, autorização privada/CORS, ausência de segredos em respostas/backup, conciliação atômica e repetição de sincronizações. Conferir UI pequena, vazia, sem rede e permissão/chave inválida. Validar conexão real das duas instituições sem registrar dados pessoais nos testes. Concluir checagem de tipos, testes e compilação nativa; registrar separadamente a limitação de não haver aparelho físico conectado.

Não contratar planos pagos. Não habilitar uma integração indisponível nem adicionar dados bancários simulados à carteira real.
