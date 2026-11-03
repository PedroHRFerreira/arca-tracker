# Controle financeiro e Discord — versão 0.5

## Uso no aplicativo

Abra **Finanças** e revise o cadastro inicial. Cadastre cada conta com um saldo observado em uma data; informe recebimentos e pagamentos efetivos separadamente das previsões. A data salarial aceita primeiro a quinto dia útil, dia fixo ou data manual. Sábados contam; feriados locais devem ser conferidos.

O campo “Quanto posso investir hoje?” só apresenta valor depois da revisão dos saldos, compromissos e carteira. Limite de cartão não compõe caixa. Uma compra gera compromisso; pagar a fatura reduz caixa e compromisso uma única vez. Previsões combinadas são substituídas pela parcela identificada das faturas, sem soma duplicada.

Em **Conferir meus bancos**, vincule contas e cartões existentes antes de importar. O histórico de pagamentos do banco não comprova a quitação da fatura do mesmo ciclo. Concilie o lançamento com o registro existente, ou confirme que é um novo registro. Movimentos já refletidos no saldo observado não são reaplicados no caixa. Estornos e transferências exigem conferência manual.

A reserva utiliza patrimônio efetivamente registrado no grupo Reserva. Alterar uma meta ou um aporte desejado não cria um investimento. Aportes recorrentes começam desativados.

## Dados e compatibilidade

- Domínio compartilhado: contratos estritos, centavos, calendário, projeções e alertas.
- SQLite: estado otimista, base confirmada e fila offline em `control_bundle_v1`.
- D1 privado: estado revisionado, auditoria, comandos idempotentes, conciliação e vínculo Discord. Uma gravação e sua auditoria são atômicas.
- `/v1/snapshot` continua com o contrato anterior; novas rotas autenticadas ficam em `/v1/control/` (`state`, `summary`, `commands`, `banks/review`, `banks/refresh`, `banks/apply`, `banks/transaction`, `discord/pair`, `discord/unlink`, `discord/setup`).
- Conflitos retornam 409 e exigem revisão das versões. Backups versão 3 incluem o controle local; versões 1 e 2 continuam aceitas. Restaurar um backup não substitui automaticamente a base online.
- A carteira de investimentos permanece no aparelho; o Discord consulta o último resumo sincronizado e sua data. Uma instalação vazia não apaga um patrimônio online positivo.
- Credenciais ficam fora do repositório, do backup e do APK. Dados pessoais de exemplo não são fixtures públicas.

## Configuração do Discord

1. No [Developer Portal](https://discord.com/developers/applications), crie **ARCA Finance**. O proprietário aceita os termos e gera o token na seção **Bot**.
2. Guarde identificador, chave pública e token somente na configuração privada do servidor como `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`. Não ative intenções privilegiadas ou permissão de administrador.
3. Depois da publicação, chame a rota autenticada `POST /v1/control/discord/setup` com `{}`. Ela valida que o token pertence ao aplicativo e registra os comandos. O aplicativo só libera vínculo após essa validação.
4. Em **Informações gerais**, salve como endpoint de interações `https://SEU_SERVICO/discord/interactions`. O Discord verifica a assinatura Ed25519 e envia um teste PING.
5. No ARCA, gere um código temporário, adicione o bot a um servidor seu com permissões mínimas e abra uma conversa privada com ele. Envie `/conectar codigo:SEU_CODIGO` e depois `/saldo`.
6. Ative alertas separadamente. Sem vínculo, não há mensagens financeiras. Em caso de DM bloqueada, o erro aparece no aplicativo, sem envio a canais públicos.

Os comandos são `/saldo`, `/gastos`, `/faturas`, `/investimentos`, `/reserva`, `/projecao`, `/relatorio`, `/metas`, `/alertas`, `/registrar`, `/pagar` e `/conectar`. Alterações exigem confirmação temporária, vinculada ao proprietário e à revisão exibida. Não há ordens de compra, pagamentos bancários ou inteligência artificial.

## Operação e validação

Aplicar migrações D1 antes de publicar o Worker. Usar somente plano gratuito; atingir cotas não autoriza contratar ou migrar para um plano pago. A execução agendada usa o fuso configurado, concilia dados disponíveis e deduplica alertas. Webhooks Pluggy usam cabeçalho privado `X-Arca-Webhook-Token` e apenas notificam uma nova consulta a conexões permitidas; links recebidos no evento nunca são seguidos.

Verificação mínima: `pnpm check`, exportação Android, testes de transações SQLite/D1, uso offline e conflito, restauração antiga, permissões negadas e inspeção real em 320/390/520 px. Testar o APK instalado e o Discord vinculado antes de afirmar validação nativa e integração externa completas.

Referências: [Meu Pluggy](https://meu.pluggy.ai/api-guide), [faturas Pluggy](https://docs.pluggy.ai/en/docs/products/credit-card-bills), [webhooks Pluggy](https://docs.pluggy.ai/en/reference/webhooks), [interações Discord](https://docs.discord.com/developers/interactions/receiving-and-responding), [D1](https://developers.cloudflare.com/d1/platform/pricing/).
