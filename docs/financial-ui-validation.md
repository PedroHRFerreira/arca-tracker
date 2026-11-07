# Finanças: clareza e próximos passos

A tela inicial de Finanças apresenta saldo em contas, uma ação prioritária e duas linhas de acompanhamento. Informações detalhadas ficam em Movimentos, Cartões e Mais; as pendências e os dados de sincronização são expansíveis. O resultado mensal previsto não é apresentado como saldo disponível.

A orientação usa os cálculos financeiros existentes. Ela direciona para uma conta, saldo, situação de fatura ou previsão específica antes da revisão geral. O caminho Onde investir mostra um valor limitado à capacidade confirmada, ao aporte desejado e ao restante da reserva. Pendências, falta de caixa, conflito entre versões, dívidas caras e incompatibilidade entre prazo curto e estratégia impedem apresentar um aporte como próximo investimento.

As opções reutilizam o catálogo versionado e a distribuição por faltas do plano. Cada exemplo explica por que aparece, riscos, liquidez, custos, fontes e como prosseguir. Exemplos de empresas não são apresentados como ações recomendadas nem classificados por rentabilidade. Preços e condições indisponíveis não são inventados.

A navegação principal usa base reta, cinco destinos e um indicador de 170 ms, sem mola, cápsula ou ampliação ao tocar. Trocas de seção em Finanças são imediatas com opacidade de 160 ms; toques rápidos não são descartados. As preferências de redução de movimento continuam respeitadas.

## Verificação local

- URL: http://localhost:8085/finances.
- Chromium gerenciado pelo Playwright; cenários sintéticos isolados, sem alterações na base financeira online.
- Larguras 320, 390 e 768 px; estado vazio, saldo pendente, reserva em formação e reserva completa com estratégia de longo prazo.
- Navegação por entradas, saídas, cartões, detalhes e projeções; cotação indisponível e acesso privado ausente.
- Texto ampliado em 50% com altura de linha proporcional. A navegação e o valor de saldo mantêm o limite de ampliação configurado de 20%; nomes acessíveis completos e ajuste de tamanho nativo permanecem disponíveis. Conferência de fontes nativas ampliadas ainda depende de uma nova instalação Android.
- Nenhum erro JavaScript ou transbordamento horizontal da página nos cenários verificados. A navegação interna permite rolagem horizontal quando os textos ampliados não cabem.
- `pnpm check` aprovado; sete testes adicionais das orientações aprovados, incluindo confirmação de saldo, fatura já paga, previsão combinada, capacidade zero, limite do aporte, dívidas e prazo.

Esta alteração está na prévia local. O APK 0.5.0 anterior não inclui esta nova interface. A validação visual não comprova a entrega de notificações em aparelho físico nem o vínculo real do proprietário no Discord.

## Testes pelos formulários — 07/11/2026

32 cenários aprovados na interface real do Chromium, por cliques, preenchimento, confirmação, cancelamento, exportação e restauração. Os registros usados são sintéticos, em sessões isoladas com fuso America/Sao_Paulo. Os saldos exibidos foram comparados com os registros exportados pelo próprio aplicativo e com o resumo financeiro. Nenhum dado pessoal ou financeiro online foi alterado.

| Fluxo | Resultado conferido |
| --- | --- |
| Contas e saldos | Nome obrigatório, conta sem saldo inventado, máscara monetária e saldo confirmado. |
| Receitas | Previsão fora do caixa; recebimento futuro recusado; confirmação atualiza a mesma receita. |
| Despesas | Data inexistente recusada; pagamento reduz caixa uma vez; desistência de cancelamento preserva o registro; cancelamento confirmado preserva o histórico e retira seu efeito. |
| Cartões | Limite utilizado fora do caixa; fatura e parcela vinculada sem duplicidade; confirmação obrigatória para pagar; pagamento parcial e quitação atualizam saldo e dívida. |
| Transferências próprias | Não viram renda adicional. |
| Configurações e persistência | Registros preservados após recarregar; seleção dos dias úteis e rejeição de feriado inválido; revisão libera a capacidade calculada e mantém aporte recorrente desativado. |
| Investimentos | Sem plano, pede planejamento; sem caixa, bloqueia opções e ativação recorrente; reserva mostra valor, motivos, riscos, custos e fonte; longo prazo segue os grupos do plano. |
| Cotação | Falha mantém o conteúdo educativo; resposta sintética com preço superior à parcela mostra aviso para acumular aportes, sem inventar quantidade de compra. Não representa cotação real verificada. |
| Recorrências e categorias | Ocorrências futuras continuam previstas; parcela com número maior que o total é recusada; orçamento da categoria é salvo. |
| Previsões | Fatura identificada substitui sua parte da previsão combinada; previsão sobreposta é recusada. |
| Integração ausente | Mensagem orienta configurar a chave e preserva os registros locais. |

Exemplo conferido: saldo de R$ 1.000 + receita recebida de R$ 500 − despesa de R$ 100 − pagamentos de R$ 80 e R$ 120 = R$ 1.200. Cancelar a despesa retorna o saldo a R$ 1.300. Limite de R$ 5.000, fatura de R$ 200 e parcela vinculada de R$ 200 não são novamente descontados. Após revisão e margem de R$ 200, a capacidade calculada é R$ 1.100, com aporte recorrente ainda em zero.

### Problemas encontrados e corrigidos

- Restaurar um backup podia deixar Finanças mostrando a base anterior. A restauração agora aguarda as operações locais e avisa as telas após concluir a transação. As sessões de reserva e longo prazo foram novamente restauradas e usadas sem recarregar a página. A revisão antes de substituir a base online permanece obrigatória.
- Erros de nome, mês, dia e parcelas podiam exibir inglês ou detalhes técnicos. Os formulários agora mostram mensagens em português; previsões sobrepostas indicam onde corrigir o registro. A recusa foi conferida novamente na interface.

Checagem de tipos e 229 testes automatizados aprovados: 75 de domínio, 8 do serviço de mercado, 52 do serviço financeiro e 94 do aplicativo. Os testes adicionais cobrem restauração, serialização, mensagens dos formulários e precisão do horário dos saldos. Nenhum erro JavaScript foi observado nos 32 cenários. A conferência visual inclui 320, 390 e 768 px e texto ampliado.

Na repetição com dados recém-importados, foi corrigida a confirmação de saldo no mesmo minuto: o formulário exibe minutos, mas novas conferências do horário atual preservam segundos, evitando que uma observação bancária anterior continue sendo considerada a mais recente. Corrigir uma observação histórica mantém seu horário original. Sete casos automatizados verificam a seleção do último saldo e a recusa de datas inválidas ou futuras.

Capturas inspecionadas nesta rodada ficam temporariamente em `/tmp`: `arca-manual-finances-summary.png`, `arca-manual-reserve-options.png`, `arca-manual-quote-minimum-warning.png` e `arca-manual-overlapping-forecast.png`. Os roteiros e resultados de teste também são temporários, sem registros pessoais no repositório.

Limites: estes testes locais não comprovam entrega de notificações Android, disponibilidade de um produto na conta bancária do usuário, consulta real de cotação ou funcionamento do Discord com o proprietário. Não foi gerado nem publicado outro APK nesta rodada.

## Preparação da versão 0.5.1

O usuário solicitou enviar o commit e gerar o APK mantendo a base atual; a atualização do SDK foi cancelada antes de alterar dependências. A exportação Android foi concluída com o código corrigido. A autenticação no EAS e as três variáveis do ambiente preview foram verificadas; a inspeção do arquivo de envio inclui os componentes novos e não inclui arquivos privados, credenciais ou bancos locais.

O Expo Doctor executado com Node 24 aprovou 19 de 22 verificações. Permanecem avisos sobre dependência direta de expo-modules-core, versões desalinhadas e a regressão de memória do Hermes da linha SDK 56. Esses avisos são registrados, sem afirmar compatibilidade completa ou modificar a base contra a orientação do usuário. Referência: [regressões conhecidas no Expo](https://expo.dev/changelog/sdk-57#known-regressions). A conclusão de um APK instalável depende da compilação EAS; o teste do novo APK instalado será registrado separadamente.

Mais 11 cenários foram aprovados pelas cinco abas: navegação; objetivo e prazo por escolha com máscara; interrupção e retomada do questionário; recusa de investimento incompleto; reserva registrada uma vez; compra de duas unidades; recusa de venda superior à posição; venda parcial; navegação offline e preservação dos dados; histórico e pedido de plano antes da projeção; importação com acesso ao registro manual. São 43 cenários no total. Compra sintética de 2 × R$ 100 mais reserva de R$ 250 mostrou patrimônio de R$ 450; vender uma unidade reduziu para R$ 350, mantendo os R$ 250 de reserva separados.

Essa conferência revelou um aviso React na rotação SVG do gráfico de distribuição que interceptava toques na prévia web. Foi corrigido usando a transformação SVG padrão, preservando a orientação e a compatibilidade nativa. A rodada completa das 11 verificações foi repetida após a correção, sem erros JavaScript ou avisos do gráfico. Captura adicional inspecionada: `/tmp/arca-release-dashboard390.png`.

Referências para os critérios educativos: [CVM — antes de investir](https://www.gov.br/investidor/pt-br/investir/antes-de-investir), [Tesouro Direto — regras e regulamento](https://tesourodireto.com.br/sobre-o-tesouro/regras-e-regulamento). As fontes de cada ativo permanecem no catálogo.
