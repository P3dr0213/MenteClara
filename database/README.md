# Banco de dados do Mente Clara

O PostgreSQL é iniciado pelo Docker Compose e fica acessível apenas no próprio computador. O banco se chama `mente_clara`; a porta publicada padrão é `5433`. Uma configuração local pode usar outra porta quando houver conflito. Confirme o estado com `npm run db:status`.

## Comandos

Execute na raiz do projeto:

| Comando | Finalidade |
| --- | --- |
| `npm run db:setup` | Inicia o banco, cria/atualiza credenciais locais e aplica migrations pendentes. |
| `npm run db:start` | Inicia o container PostgreSQL existente. |
| `npm run db:stop` | Para o container sem remover os dados. |
| `npm run db:status` | Mostra o estado do container. |
| `npm run db:console` | Abre o console SQL do banco. |
| `npm run db:test` | Verifica o esquema e as permissões do papel da API. |

O setup é idempotente: não repete migrations já registradas e preserva os dados existentes. Os arquivos `backend/.env`, `.local/` e `.local-logs/` guardam configuração ou dados locais e não devem ser enviados ao Git.

## Estrutura e migrations

- `001_create_usuarios.sql`: contas, validações e identificador UUID.
- `002_humor_sessoes.sql`: registros de humor e sessões revogáveis.
- `003_diario.sql` a `006_diario_resposta_sem_minimo.sql`: diário emocional e ajustes do campo de resposta.
- `007_bem_estar_sync.sql`: estado de bem-estar por usuário e identificadores de origem para sincronização/restauração.
- `008_amizades.sql`: código aleatório de amizade e tabela de conexões entre contas.

A tabela `amizades` grava a conexão nos dois sentidos. O identificador público de amizade é separado do ID interno da conta. A API não expõe e-mail ou registros emocionais na lista de amizades.

## Acesso e segurança

A API conecta ao PostgreSQL com o papel `mente_clara_app`, sem superusuário nem permissão para criar tabelas. O React Native nunca recebe as credenciais do banco; todas as operações passam pela API autenticada.

Se houver registros antigos sem usuário associado, uma migration que exija essa relação interrompe a execução sem apagar dados. Associe explicitamente os registros antes de reaplicar o setup.

Para os endpoints e as verificações da API, consulte [backend/README.md](../backend/README.md). O estado das tarefas de banco anteriores está em [STATUS-TASKS.md](STATUS-TASKS.md).
