# API Mente Clara

Na raiz do projeto, execute npm install e npm run db:setup. O setup aplica migrations novas sem repetir as anteriores.
Execute npm run api:start em um terminal. Use npm start em outro terminal para o Metro.

Com o Redmi desbloqueado e conectado por USB, execute npm run android:usb. O comando encaminha as portas 3001 (API) e 8081 (Metro).
A configuracao de desenvolvimento em src/api.ts usa http://127.0.0.1:3001. O telefone alcanca o computador pelo adb reverse; nao use o endereco de emulador 10.0.2.2 no Redmi.
A API escuta apenas em localhost por padrao.

## Fluxos

- POST /api/auth/register: name, email, password; retorna user e token.
- POST /api/auth/login: email, password; retorna user e token.
- GET /api/auth/me e GET /api/user/profile: usuario autenticado.
- PUT /api/user/profile: name e email; atualiza somente o usuario autenticado.
- POST /api/auth/logout: invalida a sessao atual no banco.
- POST /api/mood/register: tipo, intensidade (1 a 5), descricao opcional (ate 280 caracteres).
- GET /api/mood/:id: consulta somente registro pertencente ao usuario.
- GET /api/mood/history?period=week ou month: ultimos 7 ou 30 dias corridos, respectivamente.
- GET /health: verifica disponibilidade do banco.

Rotas privadas exigem Authorization: Bearer TOKEN.
JWT usa segredo aleatorio local, assinatura HS256, issuer/audience e validade de 7 dias. As sessoes sao verificadas no banco e revogadas no logout.
O aplicativo armazena a sessao com react-native-keychain (armazenamento seguro nativo) e consulta a API ao reabrir. Falha de rede permite repetir; sessao expirada retorna ao login.
Sair da conta requer conexao com a API para confirmar a revogacao. Nao existe renovacao automatica: apos 7 dias e necessario entrar novamente.
Senhas usam bcrypt (custo 12), com limite de 72 bytes para evitar truncamento.
O grafico mostra a intensidade media diaria na data local do celular, nao uma pontuacao de saude mental.

## Banco e dados

A migration 002_humor_sessoes cria o relacionamento entre humor e usuarios e a tabela de sessoes.
Se existirem registros antigos sem dono, a migration interrompe sem apagar dados; eles precisam de uma associacao explicita antes de continuar.
As credenciais ficam em backend/.env (ignorado pelo Git). Nao use os arquivos de .local em um repositorio publico.
Dados existentes de usuarios sao preservados.

## Verificacao

- npm test -- --runInBand: validacoes, armazenamento e navegacao das telas (API e armazenamento nativo simulados nos testes de interface).
- npm run api:test: chamadas HTTP reais ao Express com PostgreSQL local; usuarios de teste exclusivos sao removidos ao final.
- npx tsc --noEmit
- npm run lint
- npm run android:usb

A compilacao Android deve ser repetida ao adicionar o modulo nativo de armazenamento seguro. Fast Refresh sozinho nao instala esse modulo.
iOS precisa de instalacao dos pods e compilacao no macOS.

Esta configuracao e para desenvolvimento local. Para publicar a API, configure HTTPS e os segredos do ambiente de hospedagem.
