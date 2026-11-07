# Atualização bancária automática — 07/11/2026

O serviço agora aplica saldos datados, limites e faturas aos vínculos bancários já estabelecidos, tanto na atualização solicitada pelo aplicativo quanto na execução horária e após uma atualização por webhook. O contrato do APK 0.5.1 e de `/v1/snapshot` foi preservado. A atualização da conexão original continua sujeita ao ciclo diário descrito pelo [Meu Pluggy](https://meu.pluggy.ai/api-guide).

## Validação

- Checagem de tipos dos quatro pacotes concluída e 241 testes aprovados: domínio 81, serviço financeiro 58, aplicativo 94 e cotações 8.
- Casos novos cobrem repetição sem novas revisões, aplicação de cache recente pela tarefa horária, atualização autenticada com leitura do provedor, concorrência entre importação e edição, vínculos iniciais, preservação de pagamentos e ausência de recriação do histórico como receita ou dívida.
- Pagamento integral confirmado no ARCA resolve a conferência da fatura sem criar outro pagamento. Pagamentos parciais, futuros ou não confirmados não permitem essa inferência. Redução ou cancelamento de um pagamento integral reabre a conferência.
- Falha da conexão preserva os registros existentes e desabilita os indicadores de capacidade segura. O último dado mantém sua data original.
- Publicação do Worker concluída, versão `ffaf8110-c095-4162-80a3-9e545c62c5a5`, com a base existente e o agendamento horário. Nenhuma migração ou serviço pago foi acrescentado.
- Conferência autenticada em produção: duas contas e um cartão vinculados aos cadastros existentes; saldos iguais aos dados datados do provedor; nenhum novo lançamento histórico ou pagamento; atualização repetida sem alteração de revisão ou duplicação. Leitura sem autorização retornou 401 e respostas privadas mantiveram `no-store`.
- A configuração inicial preservou os identificadores e pagamentos locais. Foi mantida uma cópia privada anterior à alteração; dados pessoais e credenciais permanecem fora do repositório.

## Limites conferidos

A conexão atual não fornece o cartão do Mercado Pago. Seu saldo bancário pode ser atualizado, mas sua fatura e seus pagamentos continuam exigindo registro ou revisão. Isso descreve a cobertura observada nessa conexão, sem generalizar para outros conectores.

Os pagamentos retornados nas faturas não são aplicados por aproximação de valor ou data: a [documentação da Pluggy](https://docs.pluggy.ai/en/docs/products/credit-card-bills) explica que podem pertencer ao ciclo anterior. O pagamento já confirmado no ARCA é preservado; não há promessa de quitação automática quando falta um vínculo inequívoco.

A execução horária foi exercitada localmente com D1 e dados sintéticos; as chamadas de atualização e leitura foram verificadas em produção. Não foi necessário aguardar uma mudança real do banco nem emitir um webhook financeiro real para o teste. Esta correção é do servidor e não gera um novo APK. O aplicativo instalado consulta a base ao abrir ou voltar ao primeiro plano, desde que tenha a chave configurada e acesso à internet.
