# Open Finance no ARCA — avaliação em 2 de novembro de 2026

## Atualização após a implementação

A versão 0.4.0 implementa a conexão pessoal de leitura. As duas conexões autorizadas foram consultadas pelo serviço publicado em 02/11/2026. Não havia posições ativas nem novas operações retornadas nessa validação; uma compra futura real ainda precisa ser conferida. Os testes de operações usam exemplos sintéticos. Veja [configuração e limites](open-finance-personal.md) e [evidências de validação](open-finance-validation.md).

O texto abaixo registra a avaliação anterior à implementação e suas condições; afirmações sobre implementação pendente referem-se à versão 0.3.0.

## Decisão original

Vale estudar uma integração pessoal pelo Meu Pluggy: existe uma modalidade oficialmente gratuita que se encaixa no uso das próprias contas. A sincronização **não está implementada nem validada no ARCA**. A versão 0.3.0 mantém importação local de documentos e cadastro manual, sem botão de conexão indisponível.

## Benefícios esperados

O Banco Central inclui contas, extratos, cartões, crédito e investimentos entre os dados compartilháveis mediante consentimento. O compartilhamento é gratuito ao cliente; isso não significa que qualquer integração comercial seja gratuita. Senhas bancárias não são compartilhadas. [FAQ do Banco Central](https://www.bcb.gov.br/meubc/faqs/s/open-finance).

Aplicações possíveis no ARCA, ainda como proposta de produto:

- Atualizar posições e compras/vendas sem depender de cada comprovante.
- Usar entradas, despesas e compromissos para sugerir aportes que caibam no orçamento, com revisão do usuário; transferências entre contas próprias não devem ser contadas como renda.
- Conciliar dados bancários com registros manuais e documentos já importados, evitando duplicação.

Os dados não determinam sozinhos qual investimento é melhor. Objetivo, prazo, reserva, dívidas, liquidez e conforto com perdas continuam necessários. Sincronizar uma posição também não equivale a conhecer todo seu histórico e preço médio.

## Caminho sem mensalidade encontrado

Segundo a página oficial, o **Meu Pluggy** permite uso pessoal gratuito por prazo indeterminado, até **cinco conexões ativas do mesmo titular**, dados de contas/cartões/investimentos, API e atualização automática a cada 24 horas. O usuário conecta o banco no Meu Pluggy e vincula a conexão à aplicação no Dashboard pelo conector MeuPluggy. O aviso comercial de teste de 15 dias não limita esse uso pessoal. Contas de outras pessoas, uso comercial, conexão direta sem Meu Pluggy e mais conexões exigem plano pago. [Condições e instruções oficiais](https://www.pluggy.ai/meu-pluggy), [repositório oficial](https://github.com/pluggyai/meu-pluggy).

Isso torna viável uma prova de conexão **para o proprietário deste ARCA**. Não autoriza apresentar o mesmo caminho gratuito como integração pronta para um aplicativo distribuído a outros usuários. A cobertura e os termos devem ser reconferidos antes de implementar.

## Nubank e Mercado Pago

A tabela oficial de subtipos da Pluggy, consultada nesta data, informa:

| Conector pessoal Open Finance | Ações, ETFs e FIIs | Outros investimentos listados |
| --- | --- | --- |
| Nubank (612) | Suportados na tabela | CDB, Tesouro e fundos, entre outros |
| Mercado Pago (606) | Não suportados na tabela | CDB, LCA, LCI e alguns fundos |

Fonte: [cobertura oficial de investimentos](https://docs.pluggy.ai/en/docs/open-finance/investments). A presença na tabela é capacidade declarada do conector; **não comprova que uma conta concreta retornará todos esses produtos**. O consentimento, o contexto PF/PJ, os recursos efetivamente autorizados e a disponibilidade do banco precisam ser conferidos. A tabela geral une contextos e não deve ser usada para prometer cobertura de PF por dados de PJ. [Cobertura por instituição](https://docs.pluggy.ai/en/docs/open-finance/institutions-coverage).

O Nubank explica que o envio de seus dados começa na instituição receptora, depende da disponibilização por ela e é opcional/revogável. Apenas ativar Open Finance no app bancário não conecta o ARCA. [Orientação do Nubank](https://nubank.com.br/nu/open-finance-nubank).

## Trabalho necessário antes de oferecer a função

1. O titular cria/vincula suas próprias contas nos ambientes oficiais e autoriza o compartilhamento. Nenhuma conta, consentimento ou contrato foi criado durante este estudo.
2. Validar, com autorização do titular, os produtos e recursos recebidos de cada conexão. Uma conta sem investimentos permite validar consentimento e saldos, mas não comprova uma compra de ação.
3. Projetar autenticação pessoal e armazenamento seguro das credenciais. O exemplo oficial mantém Client Secret e chave da API no servidor, entregando ao cliente apenas um token restrito. Não embutir credenciais em `EXPO_PUBLIC_*`, JavaScript, APK ou no proxy público atual. [Padrão oficial de integração](https://github.com/pluggyai/quickstart).
4. Definir separadamente dados bancários recebidos e registros da carteira. Usar identificadores externos estáveis, paginação, reconciliação e estados de falha/consentimento expirado. Não somar posição importada a compras do mesmo ativo como se fosse um novo aporte.
5. Exibir última atualização e o que cada conexão realmente trouxe; manter documento/manual como alternativas. Atualização diária não é confirmação instantânea da execução de uma ordem.
6. Testar autorização, revogação, reconexão, conexão vazia, duplicatas, documentos anteriores, falha de rede, lançamentos corrigidos pelo banco e backup/restauração. Só então disponibilizar a função.

Adotar o provedor altera o modelo de privacidade: o documento atual é lido localmente, enquanto o Open Finance envolve compartilhamento dos dados bancários com o provedor escolhido. Isso deve ser explicado antes do consentimento. O escopo inicial seria exclusivamente leitura, sem pagamentos nem ordens de investimento.

## Participação direta e parcerias

O ARCA atual não é uma instituição participante. Participação direta e integração por provedor são caminhos diferentes. A Resolução Conjunta nº 21, de 22/10/2026, atualizou as regras de parcerias, incluindo consentimento específico por entidade e responsabilidades de acompanhamento e proteção dos dados. Qualquer integração que passe a operar como produto para terceiros precisa de avaliação própria; não basta reaproveitar a configuração pessoal. [Comunicado oficial do Banco Central](https://www.bcb.gov.br/detalhenoticia/21294/nota), [texto da resolução](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=21&tipo=Resolu%C3%A7%C3%A3o%2520Conjunta).

## Resultado do estudo

**Existe um caminho gratuito documentado para uso pessoal.** É candidato a uma próxima implementação, sujeito à conexão real e aos testes acima. Não houve chamada a dados bancários, contratação, criação de credenciais nem promessa de compatibilidade integral. A importação de comprovantes permanece útil para revisão e para dados que a conexão não fornecer.
