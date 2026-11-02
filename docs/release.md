# Build, assinatura e recuperação

## Identidade permanente

O identificador Android é `com.pedro.arcatracker`. Mantenha o identificador e o certificado de assinatura para que uma nova instalação atualize o app e preserve o SQLite.

## APK para instalação no celular

O perfil `preview` em `apps/mobile/eas.json` gera um APK de distribuição interna, sem cliente de desenvolvimento e sem depender do computador ou Expo Go. A versão visível desta entrega é 0.2.0. O EAS mantém e incrementa o código de versão Android remotamente.

Na raiz do repositório:

```bash
pnpm check
pnpm --filter @arca/mobile build:apk
```

O EAS apresenta a página do build. Depois de concluído, abra o link de instalação no Android e baixe o APK. Se o Android solicitar, autorize a instalação desse arquivo pelo navegador. Para atualizar uma instalação existente, instale por cima; desinstalar remove os dados locais.

As respostas e investimentos ficam no aparelho. Para transferir registros da prévia web ou de outro celular, exporte um backup em Configurações e restaure o arquivo no app instalado. A restauração substitui os registros do destino.

## Ambiente do APK

O build usa explicitamente o ambiente `preview` do EAS, com estas variáveis já cadastradas:

- `EXPO_PUBLIC_MARKET_PROXY_URL`: endereço público HTTPS do serviço de cotações.
- `EXPO_PUBLIC_ARCA_PROXY_TOKEN`: acesso ao proxy pessoal. Variáveis EXPO_PUBLIC são incorporadas ao aplicativo e não devem conter credenciais da brapi ou segredos administrativos.

O arquivo `.env.local` é apenas da prévia local e não deve ser incluído no build remoto. Não use IP da rede do computador em um APK destinado a funcionar fora dessa rede. O proxy operacional é `https://arca-market-proxy.pedrohrferreira-arca.workers.dev`.

Planejamento, carteira e cálculos locais funcionam sem conexão. Atualização de cotações depende da internet e do proxy. Os lembretes são locais e pedem permissão no Android; a ausência de credenciais FCM não impede esses lembretes.

## Assinatura e recuperação

O projeto já tem uma keystore gerenciada pelo EAS, usada na versão Android anterior. Reutilize essa assinatura. Não gere uma nova keystore para uma atualização.

Antes de distribuir, baixe uma cópia com `eas credentials --platform android`, opção `credentials.json` → baixar do EAS. Guarde a keystore e suas credenciais fora do repositório, com acesso restrito, e mantenha outra cópia protegida. A cópia baixada em 2 de novembro de 2026 foi aberta com keytool e teve o certificado comparado ao cadastro anterior. O EAS continua com a cópia remota.

`credentials.json`, arquivos de assinatura e APKs/AABs estão excluídos do Git. Nunca inclua senhas em commits, argumentos de comandos ou mensagens.

## Conferência no celular

Após instalar, confira abertura/ícone, resposta ao toque, transições, teclado e leitura com fonte ampliada. Faça um planejamento, registre um investimento de teste e confira backup/restauração. Ative e altere os lembretes com a permissão concedida; confira também a experiência ao recusar a permissão. A exportação JavaScript Android e testes automatizados não substituem essa conferência física.

## Cloudflare Worker

A identidade do Worker e o KV estão em `apps/market-proxy/wrangler.jsonc`. Os segredos `BRAPI_TOKEN` e `ARCA_PROXY_TOKEN` permanecem na Cloudflare, configurados com `wrangler secret put`. O build Android usa o serviço público existente.

```bash
pnpm --filter @arca/market-proxy exec wrangler deploy --dry-run
pnpm --filter @arca/market-proxy run deploy
```

Depois de atualizar, confira `/health`, uma cotação e os grupos do catálogo com o token já configurado, sem exibir credenciais nos logs.

Referências: [APK e instalação](https://docs.expo.dev/build-reference/apk/), [variáveis do EAS](https://docs.expo.dev/eas/environment-variables/) e [versões remotas](https://docs.expo.dev/build-reference/app-versions/).
