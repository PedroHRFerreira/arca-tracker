# ARCA Tracker

Aplicativo local-first para acompanhar uma carteira nos quatro quadrantes ARCA. O planejamento e a carteira ficam no SQLite do aparelho. Cotações usam um proxy público; a conexão bancária pessoal opcional usa um serviço privado separado, em modo de leitura.

> Este software não oferece recomendação de investimento. Sugestões são rankings determinísticos sobre dados públicos e projeções são apenas estimativas configuráveis.

## Estrutura

- `apps/mobile`: Expo/React Native, Android e iOS.
- `apps/market-proxy`: Cloudflare Worker para brapi e Tesouro Transparente.
- `apps/finance-proxy`: serviço privado de leitura das conexões pessoais Meu Pluggy.
- `packages/domain`: cálculos financeiros puros e contratos compartilhados.

## Desenvolvimento

```bash
pnpm install
pnpm check
pnpm dev
pnpm dev:proxy
```

Copie `.env.example` para um arquivo local de ambiente. Configure os secrets remotos com `wrangler secret put BRAPI_TOKEN` e `wrangler secret put ARCA_PROXY_TOKEN`.

Documentação de build e assinatura: `docs/release.md`.

## Planejamento para iniciantes

O fluxo inicial salva um rascunho local e pede revisão antes de ativar o plano. A sequência é organizar dívidas caras, formar a reserva e investir no objetivo. A reserva registrada fica fora das metas de longo prazo; um saldo apenas declarado para planejamento não cria patrimônio ou movimentações.

ARCA mantém os quatro grupos de 25%. A alternativa simples usa modelos educativos de renda fixa e ETFs amplos conforme prazo e respostas. Os modelos são padrões do produto e não substituem suitability da corretora. Aportes são mensais, semanais ou a cada 15 dias, seguindo o calendário local; datas mensais mantêm a ancoragem original e são limitadas ao último dia de cada mês.

O backup atual é v2 e aceita arquivos v1. As carteiras anteriores continuam disponíveis, com ativos inicialmente classificados como longo prazo. A tela Meu plano permite iniciar o novo planejamento sem recadastrar a carteira.

### Capa e identidade

A arte original em `apps/mobile/assets/arca-cover.png` é usada na apresentação, ícone e abertura. Gerada com a ferramenta integrada de imagens: arca de madeira minimalista com cabine verde profundo e pequeno ramo, água em verde sálvia e fundo marfim, ilustração editorial calma em papel recortado, sem texto ou símbolos de dinheiro.

### Verificação visual local

```bash
pnpm --filter @arca/mobile exec expo start --web
```

O Metro está configurado para o WASM do SQLite e os cabeçalhos de isolamento exigidos pelo navegador. Em uma publicação web, o servidor também precisa enviar `Cross-Origin-Embedder-Policy: credentialless` e `Cross-Origin-Opener-Policy: same-origin`, conforme a documentação do Expo SQLite. Não há publicação automática nesta alteração.

Lembretes locais exigem uma instalação nativa com permissão de notificações. A fila de aportes é renovada ao abrir ou voltar ao app; até 24 próximos aportes ficam agendados. Revisão mensal e atualização semanal têm controles independentes. Web e Expo Go não comprovam entrega de notificações nativas.

### Objetivos e orçamento guiados

O planejamento oferece objetivos e prazos prontos, com alternativas personalizadas. Campos monetários usam máscara brasileira, com os dois últimos dígitos como centavos. Renda líquida menos despesas essenciais e demais compromissos define a sobra mensal, sem repetir despesas. O app sugere inicialmente metade da sobra e explica a margem deixada livre; a pessoa escolhe aplicar ou editar o valor. Aportes recorrentes acima da capacidade informada não podem ser ativados. Perfis antigos sem renda continuam disponíveis e podem ser complementados na revisão.

### Importar comprovantes e negociações

Em Carteira ou Configurações, **Importar comprovante ou extrato** abre o fluxo documento → conferência → confirmação. São aceitos CSV/Excel com uma tabela de negociações e PDFs com texto selecionável e campos estruturados. O app lê localmente, pede correção dos dados ambíguos e só grava após revisão. Custos desconhecidos precisam ser preenchidos ou confirmados como zero. Arquivos não reconhecidos, protegidos ou digitalizados não geram compras.

A importação cobre compras e vendas de ações, ETFs e FIIs negociados na B3. Somente o catálogo verificado determina uma categoria automaticamente; outros ativos pedem classificação. Os registros de importação e sua corretora acompanham o backup; operações já existentes são verificadas por multiplicidade para evitar duplicação. A conexão pessoal opcional está descrita abaixo; a importação por documento continua independente dela.

No Android/iOS, a leitura de PDF usa o módulo local `modules/arca-document-reader` e exige nova instalação nativa; Expo Go não o inclui. Na web, PDF.js e seu worker são servidos pela própria aplicação. O `postinstall` prepara esses arquivos em `public`, sem CDN ou envio de comprovantes a terceiros. A preparação também pode ser refeita com `node apps/mobile/scripts/prepare-pdf-worker.cjs`.

### Meus bancos — uso pessoal

Em Carteira ou Configurações, **Meus bancos** consulta as conexões Nubank e Mercado Pago previamente autorizadas no Meu Pluggy. A primeira conexão usa uma chave pessoal guardada no SecureStore do aparelho; na prévia web ela dura apenas a sessão. O APK contém somente o endereço do serviço, nunca essa chave, Client Secret ou IDs das conexões.

Saldos bancários, cartões e posições aparecem separados. Aplicações totalmente resgatadas não são posições atuais. A revisão permite importar operações completas de ações, ETFs e FIIs do catálogo; custos ausentes, moeda desconhecida, histórico incompleto e correções exigem revisão. IDs externos e conciliação econômica evitam repetir operações já registradas. A atualização automática da carteira é opcional e ocorre nas próximas consultas à tela; não é sincronização contínua em segundo plano. O Meu Pluggy atualiza a origem diariamente.

Os exemplos do plano oferecem instruções verificadas por família e, no Android, um atalho para abrir Nubank ou Mercado Pago instalado. O usuário procura e confirma o produto no banco. Não há ordens automáticas nem garantia de que um exemplo esteja disponível para cada conta. Na web/iOS, o botão abre instruções claramente identificadas no site oficial.

Configuração, privacidade e limites: [conexão pessoal](docs/open-finance-personal.md). Evidências e lacunas: [validação](docs/open-finance-validation.md).
