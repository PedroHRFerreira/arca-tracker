# ARCA Tracker

Aplicativo local-first para acompanhar uma carteira nos quatro quadrantes ARCA. Os dados pessoais ficam no SQLite do aparelho; o único serviço remoto é um proxy sem estado para cotações públicas.

> Este software não oferece recomendação de investimento. Sugestões são rankings determinísticos sobre dados públicos e projeções são apenas estimativas configuráveis.

## Estrutura

- `apps/mobile`: Expo/React Native, Android e iOS.
- `apps/market-proxy`: Cloudflare Worker para brapi e Tesouro Transparente.
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
