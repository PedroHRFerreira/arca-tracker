# Clareza da conferência para investir — 07/11/2026

A confirmação geral do planejamento e as revisões individuais de previsões e compromissos são registros distintos. A consulta privada confirmou que a revisão geral estava salva; não houve alteração de dados reais nem confirmação automática dos itens pendentes.

Em “Onde investir?”, a interface agora reconhece a confirmação geral existente, lista as pendências do cálculo e mostra o próximo passo com o nome da ação correspondente. A mensagem não afirma que o cadastro inteiro precisa ser confirmado outra vez. O cálculo e seus critérios permanecem iguais.

Validação local em `http://localhost:8085/finances`: abertura das pendências com dados locais de teste, botão direto para o saldo correspondente, retorno sem salvar registros e leitura em 320 × 740, incluindo rolagem até a ação. O tamanho temporário do navegador foi restaurado. O cadastro do navegador foi preservado e não foi substituído pela base do celular.

Checagem de tipos do aplicativo e 16 testes de orientação/persistência aprovados. O caso adicional verifica que a confirmação geral continua salva no SQLite e no serviço após perda de resposta e repetição da sincronização, mantendo a previsão não revisada como pendente.

Na preparação da versão 0.5.2, a checagem de tipos dos quatro pacotes e a suíte completa passaram: 242 testes (domínio 81, aplicativo 95, serviço financeiro 58 e cotações 8).

A versão 0.5.2 está preparada para compilação do APK com esta alteração de interface, mantendo a identidade Android e a assinatura existentes. A situação da entrega será registrada após o resultado do EAS.
