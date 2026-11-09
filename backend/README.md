# API Mente Clara

Na raiz do projeto, execute `npm install`, `npm run db:setup` e `npm run db:start`. O setup aplica migrations novas sem reaplicar as anteriores.

Para testar em uma rede Wi-Fi, inicie a API com `npm run api:lan` e o Metro com `npm start`; celular e computador devem estar na mesma rede local. Para USB, inicie a API com `npm run api:start`, encaminhe a porta 3001 com `adb -s SERIAL reverse tcp:3001 tcp:3001` e inicie o Metro em localhost. O app usa `EXPO_PUBLIC_API_URL=http://127.0.0.1:3001`. Com mais de um Android conectado, informe o serial desejado nos comandos ADB e Expo.

## Fluxos

- POST /api/auth/register: name, email, password; retorna user e token.
- POST /api/auth/login: email, password; retorna user e token.
- GET /api/auth/me e GET /api/user/profile: usuario autenticado.
- PUT /api/user/profile: name e email; atualiza somente o usuario autenticado.
- GET /api/friends/code: retorna o código aleatório de amizade da conta autenticada.
- GET /api/friends: lista amizades da conta autenticada, sem expor e-mail ou dados emocionais.
- POST /api/friends: recebe `code` e cria a conexão mútua com a pessoa correspondente.
- DELETE /api/friends/:id: remove a conexão dos dois lados.
- POST /api/auth/logout: invalida a sessao atual no banco.
- POST /api/mood/register: tipo, intensidade (1 a 5), descricao opcional (ate 280 caracteres).
- GET /api/mood/:id: consulta somente registro pertencente ao usuario.
- PUT /api/mood/:id: atualiza registro de humor do proprietario.
- DELETE /api/mood/:id: exclui registro de humor do proprietario.
- GET /api/mood/history?period=week ou month: ultimos 7 ou 30 dias corridos, respectivamente.
- GET /api/user/wellbeing e PUT /api/user/wellbeing: consulta e sincroniza metas, atividades concluidas, pontos, conquistas e preferencia de lembrete da conta.
- GET /health: verifica disponibilidade do banco.
- PUT /api/diary/:id: atualiza prompt opcional e resposta da entrada do usuario autenticado.
- DELETE /api/diary/:id: exclui permanentemente a entrada do usuario autenticado.
- GET /api/data/export: exporta todos os registros de humor e diário da conta autenticada em JSON.
- POST /api/data/restore: restaura um backup `mente-clara-backup-v1` de forma transacional, adicionando até 1.000 registros à conta atual.

Os registros offline enviam um UUID `clientId` estável junto ao cadastro. O backend usa esse UUID como identificador do registro: uma repetição do pedido pelo mesmo usuário devolve o registro já salvo; colisões com registros de outra conta retornam conflito sem revelar os dados. Backups preservam um identificador de origem por usuário para ignorar reimportações repetidas.

Rotas privadas exigem Authorization: Bearer TOKEN.
JWT usa segredo aleatorio local, assinatura HS256, issuer/audience e validade de 7 dias. As sessoes sao verificadas no banco e revogadas no logout.
O aplicativo armazena a sessao com expo-secure-store (armazenamento seguro nativo) e consulta a API ao reabrir. Falha de rede permite repetir; sessao expirada retorna ao login.
Sair da conta requer conexao com a API para confirmar a revogacao. Nao existe renovacao automatica: apos 7 dias e necessario entrar novamente.
Senhas usam bcrypt (custo 12), com limite de 72 bytes para evitar truncamento.
O grafico mostra a intensidade media diaria na data local do celular, nao uma pontuacao de saude mental.

## Banco e dados

A migration 002_humor_sessoes cria o relacionamento entre humor e usuarios e a tabela de sessoes. A migration 007_bem_estar_sync adiciona estado de bem-estar por usuário e identificadores de origem para restauração idempotente. A migration 008_amizades cria códigos pessoais e conexões de amizade. O setup aplica todas as migrations pendentes em ordem.
Se existirem registros antigos sem dono, a migration interrompe sem apagar dados; eles precisam de uma associacao explicita antes de continuar.
As credenciais ficam em backend/.env (ignorado pelo Git). Nao use os arquivos de .local em um repositorio publico.
Dados existentes de usuarios sao preservados.

## Verificacao

- npm test -- --runInBand: validacoes, armazenamento e navegacao das telas (API e armazenamento nativo simulados nos testes de interface).
- npm run api:test: chamadas HTTP reais ao Express com PostgreSQL local; usuarios de teste exclusivos sao removidos ao final.
- npx tsc --noEmit
- npm run lint
- npm run android:usb

O app usa `expo-secure-store` para a sessão e `expo-camera` para leitura de QR. Use uma build de desenvolvimento instalada no aparelho para validar os módulos nativos. O botão ChatGPT da tela de emergência abre um site externo; não envia os dados do app para o ChatGPT.

Esta configuracao e para desenvolvimento local. Para publicar a API, configure HTTPS e os segredos do ambiente de hospedagem.
