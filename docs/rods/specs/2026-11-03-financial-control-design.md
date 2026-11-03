# Controle financeiro integrado — desenho aprovado

Implementar o plano aprovado na conversa de 3 de novembro de 2026.

## Comportamento

- Cinco abas: Início, Finanças, Meu plano, Carteira e Evolução; preservar a identidade e o movimento existentes.
- Diferenciar previsto, confirmado, recebido e pago. Limite de cartão nunca é saldo. Compra e pagamento da fatura não duplicam despesas.
- Salário com seleção de primeiro a quinto dia útil ou calendário personalizado. Sábado conta, domingos e feriados não; data prevista editável.
- Capacidade de aporte considera caixa confirmado, vencimentos e margem para imprevistos. Dados incompletos impedem afirmar uma sobra segura.
- Previsões combinadas de faturas são substituídas pela parte identificada, nunca somadas novamente. Composição pendente exige revisão.
- Reserva separada da carteira estratégica, contando somente recursos realizados. Aportes recorrentes começam desativados.

## Fronteiras

- Cálculos e contratos no domínio compartilhado; SQLite para cache e fila offline; D1 privado como autoridade do controle financeiro.
- Manter `/v1/snapshot` compatível; novas rotas autenticadas para estado e comandos com revisão e idempotência.
- Carteira existente permanece local; publicar somente resumo versionado para consultas do Discord.
- Integração bancária consulta apenas conexões configuradas. Campos ausentes continuam desconhecidos e o cadastro manual permanece disponível.
- Discord determinístico, privado, restrito ao proprietário, com prévia e confirmação de alterações. Credenciais somente no servidor.
- Dados pessoais iniciais ficam fora do repositório e entram como rascunho para revisão.

## Entrega

Preservar backups antigos, adicionar versão 3, alertas independentes e testes de duplicidade, calendário, caixa, migração, sincronização e autorização. Validar versão local antes de publicar código e gerar APK. Não ativar serviços pagos. Recursos externos somente são apresentados como disponíveis depois de configurados e validados.
