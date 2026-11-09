# Calibração bancária e confirmação mensal — 0.5.3

## Comportamento

- Compras estrangeiras usam somente a conversão em reais fornecida pelo banco; pendências permanecem pendentes. Na ausência de conversão ou fatura em reais conhecida, os últimos dados permanecem preservados.
- O rótulo genérico PAGAMENTO não transforma uma compra positiva no cartão em quitação de fatura. Datas de movimentações efetivadas seguem o calendário brasileiro; datas previstas e vencimentos conservam seu dia de calendário.
- Falhas da conexão não apagam a confirmação geral do planejamento. As conferências de caixa e compromissos continuam independentes.
- Previsões de parcelas antigas não duplicam parcelas identificadas; despesas recorrentes que não estejam incluídas continuam separadas.
- Finanças → Movimentos → Saídas oferece “Já paguei” para despesas fora do cartão. A confirmação pede valor, data e conta, reutiliza o lançamento e retorna à lista do mês. O mês seguinte continua previsto.
- Pagamentos no mesmo dia do saldo exigem indicar se já estão refletidos nele. Não é presumido um horário de pagamento.

## Verificações executadas

- Checagem de tipos nas quatro aplicações/pacotes: aprovada.
- 254 testes aprovados: domínio 82, serviço financeiro 62, aplicativo 102 e serviço de mercado 8.
- Exportação Android de produção com Hermes: concluída.
- Publicação do serviço financeiro: versão `9b7f271e-b4ef-4dec-92e1-6f2e441d0e28`.
- Consulta real autenticada: ambas as conexões voltaram a fornecer dados completos. Uma nova consulta preservou a confirmação geral, os pagamentos conciliados e a quantidade de pagamentos de faturas.
- Alterações pessoais realizadas com cópias privadas anteriores, validação de esquema e comparação de revisão. Nenhum valor pessoal, identificador bancário ou credencial integra este relatório.

## Validação visual manual

Ambiente separado em `http://localhost:8086`, sem chave financeira nem dados pessoais. Foram criados somente conta, saldo e despesa fictícios.

- Cadastro e repetição mensal, abertura do fluxo curto, data obrigatória, rejeição de data futura, confirmação de inclusão no saldo, baixa de uma única ocorrência e saldo sem novo desconto: aprovados.
- Uma segunda ocorrência foi confirmada separadamente; retorno à lista do mês correto e próxima ocorrência ainda prevista: aprovados.
- Viewports de 320 × 740 e 390 × 844: formulário legível, sem corte horizontal; campos e confirmação acessíveis por rolagem.
- Encontrado e corrigido um filho de texto vazio na primeira versão do formulário. Após recarregar a versão corrigida, nenhum novo erro foi registrado durante os fluxos repetidos.
- Evidência temporária inspecionada: `/tmp/arca-confirmar-pagamento.png` (somente dados fictícios; não versionada).
- A projeção foi conferida em 320 × 740 com o rótulo “Despesas não incluídas nas faturas” e a explicação para gastos de cartão ainda fora dos totais. Evidência temporária: `/tmp/arca-projecao-despesas.png`.

## Limitações conhecidas

O serviço só pode atualizar o que a conexão bancária disponibiliza, na data informada pela fonte. O cartão não disponibilizado por uma instituição continua manual. Classificação de uma despesa como cartão não comprova qual fatura a contém, sua data ou a quitação da fatura. Essas decisões continuam exigindo revisão e não são substituídas por correspondência aproximada de nomes.

O teste visual foi realizado no navegador; não representa teste físico no celular.

## Entrega Android verificada

- [Build final no Expo](https://expo.dev/accounts/pedrohrferreira/projects/arca-tracker/builds/c50ae129-70cb-41ee-8e70-00d18703ed69), concluído em 09/11/2026 às 23:05:36 UTC.
- Código do aplicativo: commit `1c25c460aa38192c29b70c2322b26b4e9a6d6dbf`, incluindo a implementação de `dd5a7f3`.
- APK baixado, ZIP íntegro, identidade `com.pedro.arcatracker`, versão 0.5.3 e código Android 11 conferidos.
- Assinatura v2 válida, com o mesmo certificado da instalação anterior.
- As mensagens do fluxo curto e o rótulo corrigido da projeção estão presentes no pacote. As credenciais privadas configuradas não foram encontradas no código embarcado.
- SHA-256 do APK: `f064d915754598085bc9b9d240d68df276977883ba52e6a3ecbcce0256b3f5c9`.

A atualização deve ser instalada por cima do aplicativo existente. As alterações bancárias já estão no servidor e são recebidas ao sincronizar; a nova interface requer este APK. As pendências de dados não fornecidos pela conexão continuam visíveis e não são convertidas em uma capacidade de aporte confirmada.
