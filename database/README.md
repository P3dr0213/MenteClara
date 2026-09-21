# Banco Mente Clara (TASK-001)

PostgreSQL 18.6 local em 127.0.0.1:5432. Banco: mente_clara.
A API futura usa o papel mente_clara_app, com permissoes de leitura/escrita na tabela usuarios, sem superusuario ou permissao de criar tabelas.

## Comandos na raiz do projeto

- npm run db:start — inicia o banco em segundo plano.
- npm run db:stop — encerra o banco de forma controlada.
- npm run db:status — verifica o processo.
- npm run db:test — testa o esquema e as permissoes, revertendo os dados de teste.
- npm run db:console — abre psql como usuario da API; use \\q para sair.
- npm run db:setup — inicializa o cluster e aplica a migration caso ainda nao exista.

Depois de reiniciar o computador, execute npm run db:start. Nao foi instalado servico automatico do Windows.

## Arquivos

- migrations/001_create_usuarios.sql: estrutura reproduzivel da tabela e trigger.
- tests/usuarios.sql: verificacoes transacionais sem dados persistentes.
- ../backend/.env: conexao local da futura API, ignorada pelo Git.
- ../backend/.env.example: modelo sem credenciais.
- ../.local/postgres-data: dados persistentes do banco; nao apagar.
- ../.local/postgres-credentials.json: credenciais locais administrativas; nao compartilhar.
- ../.local/postgresql-18.6: binarios locais.
- ../.local/postgres.log: log do servidor.

## Tabela usuarios

| Campo | Tipo |
|---|---|
| id | UUID gerado automaticamente, chave primaria |
| nome | VARCHAR(120), obrigatorio e sem espacos nas extremidades |
| email | VARCHAR(254), obrigatorio, unico sem distinguir maiusculas |
| senha_hash | TEXT obrigatorio; hash gerado pela futura API |
| criado_em | TIMESTAMPTZ automatico |
| atualizado_em | TIMESTAMPTZ atualizado por trigger |

O banco rejeita nome vazio, email sem estrutura basica e hash vazio. Validacao completa de email, politica de senha e geracao de hash pertencem a API (proximas tasks). Cadastro, login e hash de senha estao implementados na API; veja ../backend/README.md.

A conexao fica restrita ao computador (127.0.0.1) e usa autenticacao SCRAM. O React Native devera chamar a API; nunca receber as credenciais do PostgreSQL.

## Recriar em outro computador Windows

Baixe os binarios Windows x64 do PostgreSQL 18.6 pela pagina oficial da EDB:
https://www.enterprisedb.com/download-postgresql-binaries
Extraia para .local/postgresql-18.6, de modo que pgsql/bin/pg_ctl.exe esteja dentro dela.
Execute npm run db:setup e npm run db:test.
O setup nao apaga dados e registra a migration aplicada em schema_migrations.

Fonte: https://www.postgresql.org/download/windows/

## US-001 a US-004

A migration 002_humor_sessoes adiciona registros_humor (usuario_id, tipo, intensidade, descricao, criado_em) e sessoes. O setup agora aplica todas as migrations pendentes em ordem.
Consulte STATUS-TASKS.md e ../backend/README.md para os fluxos e testes completos.
