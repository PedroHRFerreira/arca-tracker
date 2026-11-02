# Validação da repaginação — 2 de novembro de 2026

## Verificações automatizadas

- Checagem de tipos dos três pacotes passou.
- Domínio: 18 testes (carteira, custo médio, rebalanceamento, modelos, etapas, centavos, datas locais, projeção e parsing brasileiro).
- Proxy: 8 testes (Tesouro e classificação por exposição, sem inferir que qualquer ETF é internacional).
- Mobile: 11 testes (SQLite real em memória usando sql.js e notificações com adaptador nativo simulado).
- Persistência: migração com ativos antigos, retomada do rascunho, isolamento do plano ativo, backup v1/v2, rollback de backup inválido, gravação atômica de movimentações e reavaliação dos alertas após mudar plano.
- Lembretes: controles independentes, permissão negada, migração dos lembretes antigos, ausência de duplicação e renovação da janela de aportes.

## Navegador real

Servidor local: http://localhost:8081, Chromium gerenciado pelo Playwright.

Fluxo completo em 390×844: valor negativo bloqueado; sete passos; recarga e retomada; estratégia simples; revisão e ativação; prioridade das dívidas; bloqueio de projeção enquanto há dívida; confirmação manual de resolução; reserva de R$ 5.000 registrada; carteira; projeção sem rendimento; prazo inválido e recuperação; exportação de backup v2 com plano e reserva corretos. Nenhum erro de execução no contexto estável.

Revisão independente em 320×740 e 768×1024: capa, erro de valor, soma personalizada de 95% bloqueada, correção para 100%, ativação, quatro abas e Evolução com histórico e projeção. Sem transbordamento horizontal. Capturas de teste ficam em /tmp, conforme a skill visual-check.

Correções finais: termos em português; nome e saldo dos investimentos manuais; nomes das abas com até duas linhas e altura que acompanha escala de fonte nativa.

## Limites da verificação

O navegador não comprova comportamento nativo do teclado, escala de fonte do sistema, entrega de notificações ou splash/ícone instalados. Não havia aparelho/emulador Android ou ambiente iOS disponível. A exportação JavaScript nativa não equivale à instalação de um APK/IPA. A capa foi inspecionada diretamente; ícone e splash foram configurados para o próximo build.

A fila local guarda até 24 próximos aportes e é renovada ao abrir ou retornar ao app. A consulta de cotações depende da configuração e disponibilidade do proxy; o planejamento e o catálogo educativo funcionam sem uma cotação nova.

## Atualização: escolhas, máscara monetária e orçamento

Validação adicional em 2 de novembro de 2026:

- Objetivos por alternativas, Outro objetivo e prazos em meses (incluindo 48 meses personalizado), preservados após recarregar.
- Máscara em reais compartilhada no planejamento, registro de investimentos e aporte de cenário. Valores canônicos continuam em decimal no SQLite; percentuais e quantidades não recebem máscara monetária.
- Renda líquida, gastos essenciais e demais compromissos geram a sobra mensal. Sugestão educativa explícita de metade da sobra; frequência considera até cinco aportes semanais ou três de 15 dias em um mês. Aplicação da sugestão exige toque da pessoa.
- Orçamento simulado de R$ 3.000 de renda e R$ 2.200 de gastos: sobra R$ 800; sugestão semanal R$ 80. Aporte de R$ 300 por semana bloqueado na ativação; após aplicar R$ 80, plano ativado e mantido após recarregar.
- Modelo simples com seis meses: 100% renda fixa. Etapa de reserva apresenta Tesouro Selic como exemplo verificável e mostra o valor planejado para o grupo.
- Chromium real: sessão isolada em localhost:8082; largura 320 px sem transbordamento horizontal. A prévia principal e seus dados em localhost:8081 foram preservados. Nenhum erro de execução no teste estável.
- Checagem de tipos e 42 testes passaram (23 domínio, 8 proxy, 11 mobile), incluindo compatibilidade de perfis anteriores sem dados de renda, máscaras, centavos e orçamento.
- O serviço configurado de cotações aponta para rede privada; saúde e cotação não puderam ser alcançadas nesta sessão. Não comprova operação no celular fora dessa rede. Instalação e notificações nativas continuam pendentes de validação física.

## Atualização: aparência de app e movimentos

- Identidade ARCA em verde, fundo claro, cartões arredondados, patrimônio registrado em destaque, controle de visibilidade dos valores e atalhos para registro, plano, simulação e histórico.
- Barra de abas flutuante com acabamento translúcido e indicador que acompanha a seleção. Desfoque no iOS e web; acabamento translúcido no Android. O Android não utiliza a API de Liquid Glass da Apple.
- Transição entre abas, entrada dos cartões, resposta ao toque, entrada/saída das etapas do planejamento e troca entre histórico/simulação. Preferência de movimento reduzido do sistema respeitada.
- Prévia local em http://localhost:8083/dashboard. Os dados da prévia anterior em localhost:8081 permanecem em sua origem. Nenhuma publicação executada.
- Chromium: quatro abas, atalhos de evolução, objetivo por alternativas, máscara em reais, erro de valor obrigatório e avanço/retorno preservando respostas. Largura 320 px sem transbordamento horizontal; revisão visual também em 390 px e tablet. Nenhum erro de execução observado.
- Checagem de tipos e 42 testes passaram. Exportação JavaScript Android passou com o novo módulo expo-blur; isso não confirma instalação, notificações ou fluidez em aparelho físico.
- Ícone, splash e desfoque nativo exigem nova instalação/build para avaliação no aparelho. A integração de cotações continua sujeita à disponibilidade do proxy documentada acima.
