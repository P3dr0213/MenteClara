# US-001 a US-004

Implementacoes concluidas no codigo:
- TASK-001 a TASK-011: usuarios, cadastro/login, bcrypt, sessao persistente nativa, JWT revogavel, logout, validacoes e testes de API/telas.
- TASK-012 a TASK-017: consulta e edicao de perfil autenticadas, formulario e persistencia.
- TASK-018 a TASK-026: migration de humor por usuario, cadastro e consulta, tipo/intensidade/descricao e validacao.
- TASK-027 a TASK-033: historico do usuario, filtros de 7/30 dias, lista, grafico de intensidade media e estados de carregamento/erro/vazio.

O setup aplica a migration 002_humor_sessoes, preservando a 001 original de usuarios.
Consulte backend/README.md para comandos e limites da verificacao. Testes automatizados nao substituem homologacao completa da interface no celular.

## Verificacao desta entrega

- 21 testes Jest aprovados (8 suites).
- 8 cenarios de API com PostgreSQL real aprovados (9 resultados contando a suite).
- TypeScript e ESLint aprovados.
- Teste SQL original de usuarios aprovado.
- Migration 002 aplicada e setup repetido sem reaplicar migrations.
- APK Android: BUILD SUCCESSFUL (assembleDebug).
- Bundle JavaScript Android gerado com sucesso pelo Metro.
- Atualizacao no Redmi bloqueada por INSTALL_FAILED_USER_RESTRICTED. A nova versao ainda precisa de autorizacao no aparelho; o fluxo completo com armazenamento nativo ainda nao foi homologado no celular.
