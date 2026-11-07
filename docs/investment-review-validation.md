# Clareza da conferência para investir — 07/11/2026

A confirmação geral do planejamento e as revisões individuais de previsões e compromissos são registros distintos. A consulta privada confirmou que a revisão geral estava salva; não houve alteração de dados reais nem confirmação automática dos itens pendentes.

Em “Onde investir?”, a interface agora reconhece a confirmação geral existente, lista as pendências do cálculo e mostra o próximo passo com o nome da ação correspondente. A mensagem não afirma que o cadastro inteiro precisa ser confirmado outra vez. O cálculo e seus critérios permanecem iguais.

Validação local em `http://localhost:8085/finances`: abertura das pendências com dados locais de teste, botão direto para o saldo correspondente, retorno sem salvar registros e leitura em 320 × 740, incluindo rolagem até a ação. O tamanho temporário do navegador foi restaurado. O cadastro do navegador foi preservado e não foi substituído pela base do celular.

Checagem de tipos do aplicativo e 16 testes de orientação/persistência aprovados. O caso adicional verifica que a confirmação geral continua salva no SQLite e no serviço após perda de resposta e repetição da sincronização, mantendo a previsão não revisada como pendente.

Na preparação da versão 0.5.2, a checagem de tipos dos quatro pacotes e a suíte completa passaram: 242 testes (domínio 81, aplicativo 95, serviço financeiro 58 e cotações 8).

## APK publicado

Compilação EAS concluída em 07/11/2026 às 20:36 (São Paulo), versão 0.5.2, código Android 9, a partir do commit `510ca1d`. [Baixar e instalar pelo Expo](https://expo.dev/accounts/pedrohrferreira/projects/arca-tracker/builds/830bab4f-e64c-4a7c-a0be-a42dcf14ae37).

O APK foi baixado e sua integridade ZIP foi conferida. O manifesto confirma `com.pedro.arcatracker`, versão 0.5.2 e código 9. As novas mensagens estão no pacote JavaScript final. Não foram encontradas as credenciais privadas configuradas do serviço nos arquivos do APK.

A assinatura v2 foi validada criptograficamente com a biblioteca Android apksig. O certificado é idêntico ao APK 0.5.1, permitindo atualizar a instalação existente. SHA-256 do APK: `d3a7ac7a88b8f33a7533d30d20081686693f5c80062e71cfc58064f77f15a218`.

Esta entrega preserva o SDK e os módulos nativos existentes. Não houve instalação física ou nova conferência de notificações neste ciclo; a validação de interface foi local, complementada pelos testes de persistência e pela conferência do APK assinado.
