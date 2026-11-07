# Atualização dos dados bancários

Corrigir a sincronização solicitada pelo usuário, preservando o APK 0.5.1 e os contratos existentes. O usuário confirmou que a fatura de novembro do Mercado Pago ainda não foi paga; não criar pagamento para ela. Os dados pessoais usados na conferência permanecem fora do repositório.

Vincular uma vez as contas e o cartão disponíveis aos cadastros correspondentes, mantendo os identificadores locais. Atualizações automáticas posteriores abrangem os saldos observados, limites e faturas disponibilizados pelo banco. Não tratar consultas ao ARCA como nova coleta pelo banco, nem prometer tempo real: o Meu Pluggy informa sincronização diária da conexão original.

Reutilizar o cache e o agendamento existentes. Consultas solicitadas, webhooks e execução periódica devem aplicar os dados disponíveis dos vínculos já estabelecidos. Evitar revisões sem alterações e usar comparação de revisão com nova leitura em caso de concorrência. Falhas preservam o último dado conhecido.

Não importar histórico antigo como dívida nova nem reaplicar movimentações já incluídas nos saldos. Faturas antigas sem cadastro prévio ficam disponíveis na consulta, sem serem adicionadas automaticamente como abertas. O pagamento informado em um ciclo bancário pode pertencer ao anterior: não quitá-lo por soma ou proximidade de datas. Um pagamento efetivo já confirmado no próprio ARCA que cobre o total da fatura resolve a pendência de conferência; cancelá-lo ou reduzi-lo reabre a conferência.

Validar saldos datados, repetição da atualização, ausência de vínculo, falha parcial, confirmação e cancelamento de pagamentos, histórico e concorrência. Publicar a correção do serviço e conferir os dados reais com as credenciais existentes, sem alterar previsões futuras, saldos por estimativa, investimentos ou criar pagamentos sem confirmação.
