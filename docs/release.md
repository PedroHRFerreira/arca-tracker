# Build, assinatura e recuperação

## Identidade permanente

O identificador Android é `com.pedro.arcatracker`. Não o altere depois de distribuir a primeira versão; o sistema operacional usa identificador e certificado para reconhecer atualizações.

## Keystore Android

1. Gere uma única keystore de produção fora do repositório.
2. Guarde o arquivo em armazenamento seguro e mantenha um segundo backup criptografado em outro local.
3. Guarde alias e senhas em um gerenciador de segredos, nunca em `.env`, Git ou mensagens.
4. Registre os fingerprints SHA-256 do certificado em seu inventário privado.
5. Antes de publicar, instale uma versão, grave dados locais e instale a próxima por cima para confirmar que o SQLite foi preservado.

Exemplo de geração, executado manualmente fora do repositório:

```bash
keytool -genkeypair -v -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000 -keystore arca-tracker-production.keystore -alias arca-tracker
```

## Builds

- Desenvolvimento: `pnpm --filter @arca/mobile android`
- APK interno: `eas build --platform android --profile preview --local`
- Produção: `eas build --platform android --profile production --local`

Não execute um build distribuível até confirmar que a keystore e seu backup podem ser restaurados.

## Cloudflare Worker

Crie os namespaces KV, substitua os IDs em `wrangler.jsonc`, configure `BRAPI_TOKEN` e `ARCA_PROXY_TOKEN` com `wrangler secret put`, e então execute `pnpm --filter @arca/market-proxy deploy`.
