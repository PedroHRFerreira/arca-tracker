# Conexão pessoal de leitura

A versão 0.4.0 usa as conexões do próprio titular no Meu Pluggy. Não transforma o ARCA em participante do Open Finance nem oferece esse acesso para terceiros. O caminho pessoal gratuito permite até cinco conexões do mesmo titular e atualização diária, conforme as [condições oficiais](https://www.pluggy.ai/meu-pluggy), consultadas em 02/11/2026. Nenhum plano pago foi contratado.

## Preparação do servidor

1. Conectar os bancos no Meu Pluggy e vincular cada conexão à aplicação no Dashboard, pelo conector MeuPluggy, com autorização do titular.
2. Guardar `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `ARCA_FINANCE_TOKEN` e `PERSONAL_ITEMS_JSON` em um arquivo privado fora do repositório. O token pessoal deve ser aleatório, base64url, com pelo menos 32 caracteres. `PERSONAL_ITEMS_JSON` é uma string JSON com objetos `{id, institution}`, instituições `NUBANK` ou `MERCADO_PAGO`, até cinco IDs únicos. Nunca colocar valores reais em documentação, testes ou argumentos de comandos.
3. Publicar `apps/finance-proxy` e usar `wrangler secret bulk /caminho/privado/connection.json`. O serviço responde 503 até os segredos existirem. Credenciais administrativas nunca vão para `EXPO_PUBLIC_*`.
4. Definir somente `EXPO_PUBLIC_FINANCE_PROXY_URL` no ambiente do aplicativo e do build EAS. Para web, adicionar a origem exata à lista `ALLOWED_ORIGINS`; aplicações nativas não enviam Origin. A autenticação pessoal continua obrigatória.
5. No aplicativo, abrir Carteira → Meus bancos e colar a chave de acesso pessoal. Ela fica no SecureStore nativo e fora do backup. A web guarda a chave somente em sessionStorage. Trocar o token no servidor revoga as cópias anteriores; cada aparelho precisa receber a nova chave.

A configuração deste proprietário foi concluída. O arquivo local privado de instruções é mantido fora do projeto e não deve ser versionado ou anexado a relatórios.

## Comportamento e limites

- Somente `GET /v1/snapshot`, com token pessoal e IDs autorizados definidos no servidor. Sem busca arbitrária de contas, pagamentos ou ordens. `GET /health` não retorna dados pessoais. Respostas privadas sem cache; logs de payload desativados.
- A consulta acontece ao abrir/revisitar Meus bancos ou tocar Atualizar. A origem Meu Pluggy acompanha a atualização diária do banco; tocar Atualizar não força uma nova coleta no banco. Os [IDs das conexões pessoais devem ser guardados individualmente](https://meu.pluggy.ai/api-guide).
- Contas, cartões e posições são informações separadas da carteira ARCA e da reserva. Limite de cartão não é saldo. Aplicações resgatadas são omitidas das posições atuais, mantendo referências no histórico para importar também vendas totais. Para histórico incompleto, usar extrato. Não inferir compras de posições.
- Operações conhecidas em BRL só entram com código/categoria, quantidade, preço, data de execução e todos os componentes de custo confirmados. Campo ausente não significa taxa zero. A [Pluggy distingue execução (`date`) e liquidação (`tradeDate`)](https://docs.pluggy.ai/en/docs/products/investment-transactions); a conciliação usa execução.
- Histórico paginado tem limites: até três páginas por recurso, 12 consultas de histórico, 40 requisições e 45 segundos por consulta. Falha ou truncamento torna a conexão incompleta, bloqueia a importação e preserva seus dados anteriores no aparelho. A lista do banco não garante todo o histórico necessário para custo médio.
- A revisão é explícita. Se uma operação estiver incompleta, o histórico desse investimento fica pendente em conjunto, evitando registrar uma compra sem a venda correspondente. A opção de importar automaticamente atua somente nas próximas consultas e apenas para operações completas reconhecidas. Duplicatas por ID e operação econômica são protegidas na mesma transação SQLite. Alterações do banco ou de lançamentos vinculados exigem revisão manual. Não há serviço em segundo plano realizando compras ou importação.
- Desconectar remove a chave e o cache bancário do aparelho e desliga a preferência automática. Mantém a carteira e suas movimentações. Revogar o consentimento bancário é uma ação separada no Meu Pluggy ou banco.
- Os exemplos do plano indicam famílias divulgadas pelo banco e fontes verificadas. O Android abre somente os pacotes oficiais; se não estiverem instalados, oferece instruções separadas. Nenhuma ordem é preenchida ou enviada. iOS/web oferecem instruções oficiais.

O uso pessoal não garante cobertura de todo produto ou que uma futura compra tenha todos os custos no provedor. Importação de comprovante e registro manual continuam disponíveis. As credenciais administrativas compartilhadas em conversa devem ser rotacionadas pelo titular no Dashboard e atualizadas nos segredos do servidor, sem reenviá-las por mensagem.
