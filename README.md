# Mente Clara

Aplicativo móvel de acompanhamento de bem-estar desenvolvido com React Native, TypeScript e Expo SDK 57. O projeto inclui autenticação, perfil, registro e histórico de humor, diário, autoavaliação, exercícios de bem-estar, tema claro/escuro, ajuda com acesso externo ao ChatGPT e amizades com QR code e leitura pela câmera.

> O Mente Clara é uma ferramenta de apoio ao bem-estar. Ele não substitui atendimento médico, psicológico ou serviços de emergência.

## Tecnologias

- Expo SDK 57 e React Native 0.86;
- TypeScript;
- `expo-camera` para leitura de QR codes;
- `toqr` para gerar o QR pessoal de amizade;
- Node.js e Express;
- PostgreSQL;
- `expo-secure-store` para guardar a sessão no aparelho;
- Jest para testes automatizados.

## Pré-requisitos

- [Node.js](https://nodejs.org/) 22.13 ou superior e [Git](https://git-scm.com/);
- [Docker](https://www.docker.com/) e Docker Compose (para gerenciar o PostgreSQL de forma isolada na porta 5433, compatível com Linux e Windows);
- Para Android: `adb` e Depuração USB ativada no aparelho. `npm run android -- --device` instala a build de desenvolvimento e permite escolher o aparelho;
- Para compilar a build Android localmente, Android SDK e JDK compatíveis com o projeto;
- *(Opcional)* [Expo Go](https://expo.dev/go) para testar recursos compatíveis. A build de desenvolvimento é recomendada para os fluxos com módulos nativos.

Para executar pelo Wi-Fi, o celular e o computador precisam estar conectados na mesma rede local. Se solicitado, autorize o Node.js no firewall do seu sistema operacional.

## Instalação

Clone o repositório e entre na pasta:

```bash
git clone URL_DO_REPOSITORIO
cd MenteClara
```

Instale as dependências:

```bash
npm install
```

Na primeira execução, inicialize o banco de dados e aplique as migrations:

```bash
npm run db:setup
```

Esse comando inicializa o container PostgreSQL via Docker (porta padrão `5433`), cria o usuário e banco `mente_clara`, aplica todas as migrações SQL e gera o arquivo `backend/.env` com credenciais seguras. Se a porta estiver ocupada, ajuste a porta publicada na configuração local do Compose e confirme a porta efetiva com `npm run db:status`. Os arquivos `.env`, `.local/` e `.local-logs/` são locais e não devem ser enviados ao Git.

O PostgreSQL fica acessível somente em `127.0.0.1:5433`. A senha administrativa é gerada localmente e fornecida ao Docker por um arquivo em `.local/`. Para instalações anteriores, execute `npm run db:setup` para aplicar a configuração e substituir a senha administrativa antiga, preservando os dados existentes. Use os comandos `db:start` e `db:setup` para preparar esse arquivo antes de iniciar o container.

## Executar pelo Wi-Fi

Abra três abas de terminal na pasta do projeto:

No primeiro terminal, certifique-se de que o banco está ativo:

```bash
npm run db:start
```

No segundo terminal, inicie a API para a rede local:

```bash
npm run api:lan
```

No terceiro terminal, inicie o Metro:

```bash
npm start
```

Depois que o QR code aparecer no terminal:

1. Abra a build de desenvolvimento Mente Clara no celular. Para instalar pela primeira vez, use `npm run android -- --device` e escolha o aparelho na lista.
2. Aguarde a compilação do bundle JavaScript.
3. Para Expo Go, abra o app e leia o QR code, desde que os módulos usados sejam compatíveis com a versão instalada.

Mantenha os três terminais abertos enquanto utilizar o aplicativo.

## Endereço da API

Pelo Wi-Fi, o aplicativo tenta localizar automaticamente o computador que executa o Metro. Se houver VPNs ou adaptadores virtuais e o Expo escolher o IP errado, crie ou copie o arquivo de configuração:

* **Linux / macOS:**
  ```bash
  cp .env.example .env
  ```
* **Windows (PowerShell):**
  ```powershell
  Copy-Item .env.example .env
  ```

Edite o `.env` na raiz informando o IPv4 do seu computador na rede local:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
```

> **Dica:** Descubra o IP da sua máquina com `hostname -I` (Linux) ou `ipconfig` (Windows). Reinicie o Expo após alterar o `.env`.

## Executar no Android por USB (sem depender de Wi-Fi)

Conecte o celular com a **Depuração USB** ativada e confirme o reconhecimento:

```bash
adb devices
```

No arquivo `.env` da raiz, defina:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001
```

Identifique o serial do aparelho na saída. Com mais de um celular conectado, use o serial do Galaxy ou do aparelho desejado. Instale a build de desenvolvimento uma vez, caso ainda não exista:

```bash
npm run android -- --device
```

Escolha o aparelho no menu do Expo. O comando compila e instala o app. Para encaminhar API e Metro por USB, abra um terminal para o banco:

```bash
npm run db:start
```

Em outro terminal, inicie a API e mantenha-a ativa:

```bash
npm run api:start
```

No terminal do projeto, substitua `SERIAL` pelo identificador mostrado por `adb devices -l`. Use uma porta livre para o Metro; abaixo, o exemplo usa `8084`:

```bash
adb -s SERIAL reverse tcp:3001 tcp:3001
adb -s SERIAL reverse tcp:8084 tcp:8084
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 ANDROID_SERIAL=SERIAL npx expo start --localhost --port 8084 --android
```

O Metro abre a build de desenvolvimento no aparelho escolhido. A porta `8081` pode já estar ocupada por outro projeto; nesse caso, use outra porta livre e encaminhe a mesma porta com `adb reverse`. Repita os comandos de encaminhamento para cada aparelho USB que for usar. O túnel precisa ser configurado novamente após desconectar o cabo ou reiniciar o celular.

## Comandos disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm start` | Inicia o Expo e exibe o QR code. |
| `npm run android -- --device` | Compila/instala a build de desenvolvimento e permite escolher um aparelho Android. |
| `npm run android:usb` | Atalho USB para iniciar o Metro em localhost quando a porta 8081 estiver livre. |
| `npm run ios` | Abre o projeto no simulador iOS, no macOS. |
| `npm run api:lan` | Inicia a API acessível pela rede local. |
| `npm run api:start` | Inicia a API somente no computador. |
| `npm run db:start` | Inicia o PostgreSQL local. |
| `npm run db:stop` | Encerra o PostgreSQL corretamente. |
| `npm run db:status` | Mostra o estado do PostgreSQL. |
| `npm run db:setup` | Prepara o banco e aplica migrations. |

Ao terminar, execute `npm run db:stop`. Isso evita uma recuperação demorada do banco na próxima inicialização.

## Testes e verificações

Antes de criar um commit, execute:

```powershell
npm run typecheck
npm test -- --runInBand
npm run lint
npx expo install --check
npx expo-doctor
```

## Solução de problemas

### O QR code abre, mas o bundle não é baixado

- Aguarde o terminal informar que o bundle Android foi concluído e toque em recarregar no Expo Go.
- Confirme que o computador e o celular estão na mesma rede.
- Permita conexões do Node.js no Firewall do Windows para redes privadas.
- Desative VPNs que façam o Expo anunciar outro IP ou configure a API manualmente no `.env`.

### O aplicativo não conecta à API

Confira o banco e o endpoint de saúde:

```powershell
npm run db:status
Invoke-WebRequest http://127.0.0.1:3001/health
```

A API deve responder `{"ok":true}`.

### O banco demora para iniciar

Isso pode ocorrer quando o PostgreSQL não foi encerrado corretamente. Aguarde a recuperação e use `npm run db:stop` antes de desligar o computador nas próximas vezes.

### O Expo Go mostra uma tela azul

A tela azul com **Continue** é o menu inicial de desenvolvimento do Expo Go. Toque em **Continue** e feche o menu pelo **X**. A mensagem `Failed to download remote update` indica que o Metro ainda está compilando ou não está acessível pela rede.

## Estrutura principal

```text
MenteClara/
├── App.tsx                 # Interface e navegação principal
├── src/                    # API, armazenamento e regras do aplicativo
├── backend/                # API Express
├── database/               # Migrations e documentação do banco
├── docs/                   # Planejamento e documentação complementar
├── __tests__/              # Testes automatizados
├── legacy-native/          # Projetos anteriores à migração
└── app.json                # Configuração do Expo
```

Os projetos nativos anteriores estão em `legacy-native/` apenas como referência. Para gerar novos projetos compatíveis, use `npx expo prebuild`.

## Backlog e planejamento

O backlog consolidado está em [docs/Backlog_MC_Sprints.xlsx](docs/Backlog_MC_Sprints.xlsx). A planilha contém:

- 28 histórias de usuário e seus critérios de aceite;
- resumo do MVP, versões seguintes e itens futuros;
- distribuição por Sprint 1, Sprint 2 e Sprint 3;
- prioridade MoSCoW, complexidade e dependências;
- análise por IA, comunidade moderada e integrações avançadas ainda fora do escopo atual. A lista básica de amizades e o acesso externo ao ChatGPT foram registrados na Sprint 3.

As próximas entregas estão resumidas abaixo, seguindo os IDs, as prioridades e as dependências da planilha. As sprints representam a sequência planejada; datas e responsáveis ainda não estão definidos. Uma história só deve ser considerada concluída após a verificação dos seus critérios de aceite.

| Entrega | Objetivo | Histórias |
| --- | --- | --- |
| Fechamento da Sprint 1 | Validar em dispositivo os fluxos essenciais, incluindo a autoavaliação implementada. | US-001 a US-005, US-007 a US-009 |
| Sprint 2 | Ampliar a rotina de autocuidado, a acessibilidade e a personalização. | US-006, US-010 a US-016 |
| Sprint 3 | Ampliar o controle dos dados e o acompanhamento, além de registrar as novas entregas de interface, amizade, ajuda externa e execução Android. | US-017 a US-021, US-025 a US-028 |
| Backlog futuro | Avaliar análise por IA, comunidade moderada e integrações após definir requisitos, segurança e fontes de dados. | US-022 a US-024 |

## Backlog da Sprint 1

A Sprint 1 concentra as funcionalidades essenciais para a primeira versão funcional do **Mente Clara**, priorizando autenticação, acompanhamento emocional, registro de diário, exercícios de respiração e acesso a informações de apoio.

| ID | Épico | História de Usuário / Entrega | Prioridade | Story Points | Dependências |
| --- | --- | --- | :---: | :---: | :---: |
| US-001 | Autenticação e Perfil | Implementar cadastro, autenticação e encerramento seguro da sessão do usuário. | 1 | 3 | — |
| US-002 | Autenticação e Perfil | Permitir a visualização e atualização dos dados básicos do perfil do usuário. | 1 | 2 | US-001 |
| US-003 | Humor e Diário | Permitir o registro do estado de humor, sua intensidade e uma descrição opcional. | 1 | 3 | US-001 |
| US-004 | Humor e Diário | Disponibilizar o histórico de registros de humor por meio de lista e visualização gráfica. | 1 | 3 | US-003 |
| US-005 | Respiração e Relaxamento | Disponibilizar exercício guiado de respiração para auxiliar em momentos de relaxamento. | 1 | 3 | — |
| US-007 | Ajuda e Segurança | Disponibilizar informações e contatos de apoio para situações de crise ou necessidade de auxílio. | 1 | 3 | — |
| US-008 | Autoavaliação | Permitir a realização de questionários de autoavaliação e apresentar resultados de caráter informativo. | 2 | 3 | US-001 |
| US-009 | Journaling | Permitir a criação, armazenamento e consulta de registros de diário guiado. | 1 | 3 | US-001 |

### Critérios de priorização

- **Prioridade 1:** funcionalidade essencial para a entrega da versão.
- **Prioridade 2:** funcionalidade importante, mas que não impede a entrega principal.
- **Prioridade 3:** funcionalidade desejável, podendo ser planejada para versões futuras.

### Story Points

Os **Story Points** representam uma estimativa relativa do esforço necessário para implementar cada história, considerando complexidade, quantidade de trabalho e possíveis incertezas.

| Story Points | Esforço estimado |
| :---: | --- |
| 1 | Muito simples |
| 2 | Pequeno |
| 3 | Médio |
| 5 | Médio/Alto |
| 8 | Alto |

> Os critérios de aceite detalhados de cada história estão disponíveis na aba **Backlog Simplificado** da planilha do projeto. O planejamento e a distribuição das histórias nas próximas entregas podem ser consultados na aba **Sprints**.

### Próxima entrega: fechamento da Sprint 1

O código já contém os fluxos de autenticação, perfil, registro e histórico de humor, respiração, ajuda, diário e autoavaliação. Essa disponibilidade não substitui a validação da entrega em dispositivo.

- [x] **US-008 — Implementação da autoavaliação:** questionário com quatro perguntas, validação de preenchimento, resumo das respostas, revisão e opção de refazer. A tela informa que não é diagnóstico nem teste clínico validado.
- [x] **US-008 — Fluxo em dispositivo Android:** conferidos o acesso pelo Início, a seleção das quatro respostas e a exibição do resumo.
- [ ] **US-008 — Acessibilidade em dispositivo:** conferir a navegação com leitor de tela e fontes ampliadas.
- [ ] **US-001 e US-002 — Conta e perfil:** validar cadastro, login, restauração da sessão, atualização do perfil e logout no celular, incluindo falhas de conexão e sessão expirada.
- [ ] **US-003 e US-004 — Humor e histórico:** confirmar persistência dos registros e consulta em lista e gráfico nos períodos semanal e mensal.
- [ ] **US-005 e US-007 — Respiração e ajuda:** validar o ciclo completo do exercício e o acesso às informações e contatos de apoio.
- [ ] **US-009 — Diário:** validar criação, consulta, edição e exclusão, garantindo que cada conta acesse apenas seus registros.

Para acessar a autoavaliação, entre na conta e abra **Início → Autoavaliação de bem-estar**. O resultado resume as percepções sobre descanso, energia, tempo para si e conexão com outras pessoas, sem pontuação clínica. As respostas ficam somente na tela e são descartadas ao sair; esta entrega não inclui histórico de autoavaliações.

## Sprint 2 — estabilidade e bem-estar

Objetivo: ampliar os recursos de uso recorrente e concluir os requisitos de acessibilidade, conteúdo e personalização. A prioridade segue a classificação MoSCoW da planilha: **Must** (essencial), **Should** (importante), **Could** (desejável) e **Won't** (fora do escopo atual).

| ID | Entrega | Critério de aceite resumido | Prioridade | Dependências |
| --- | --- | --- | --- | --- |
| US-006 | Lembretes de humor e exercícios | Configurar horário, ativar/desativar e receber a notificação no horário escolhido. | Should | US-003 ou US-005 |
| US-010 | Acessibilidade das telas principais | Verificar rótulos acessíveis, contraste e tamanho das áreas de interação no Android. | Must | Todas as telas principais |
| US-011 | Conteúdos educativos | Listar conteúdos de bem-estar e permitir abrir cada item para leitura. | Should | — |
| US-012 | Preferência de tema | Aplicar tema claro/escuro em todas as telas e manter a escolha após reiniciar o aplicativo. | Could | — |
| US-013 | Autocuidado e gratidão | Registrar práticas, consultar registros anteriores e marcar atividades concluídas. | Should | US-001 |
| US-014 | Metas de bem-estar | Criar metas, registrar progresso e consultar seu andamento. | Should | US-003, US-005 |
| US-015 | Biblioteca de relaxamento e mindfulness | Listar diferentes exercícios e permitir iniciar e finalizar cada prática. | Should | US-005 |
| US-016 | Pontos e conquistas | Atribuir pontos/conquistas às atividades elegíveis e salvar o progresso. | Could | US-003, US-005 |

Tema claro/escuro, conteúdos, práticas, metas, conquistas e preferências de lembrete estão implementados. O estado de bem-estar agora fica associado à conta no backend e no aparelho, com reconciliação por data de atualização. O tema continua salvo no SecureStore local. Os rótulos e alvos das telas foram ampliados; leitor de tela, escala ampliada e contraste ainda precisam de validação manual em Android e iOS.

### Funcionalidades da Sprint 2 disponíveis no código

A área **Bem-estar** reúne lembretes diários, conteúdos educativos, práticas de autocuidado e relaxamento, metas e pontos/conquistas. Os lembretes usam notificações locais no aparelho; cada aparelho exige permissão própria. A configuração é sincronizada na conta e um agendamento local é recriado quando a permissão está disponível. Se o usuário negar a permissão, o app informa como habilitá-la e não remove lembretes existentes durante a tentativa.

## Sprint 3 — dados, sincronização e entrega

Objetivo: ampliar o acesso aos dados e os recursos de acompanhamento, respeitando as dependências das entregas anteriores.

| ID | Entrega | Critério de aceite resumido | Prioridade | Dependências |
| --- | --- | --- | --- | --- |
| US-017 | Exportação de registros | Gerar um arquivo com os registros selecionados pelo usuário. | Could | US-003, US-009 |
| US-018 | Uso offline e sincronização | Criar registros básicos sem conexão e sincronizá-los quando a internet retornar. | Could | US-003, US-005 |
| US-019 | Backup e restauração | Criar e restaurar uma cópia dos dados sem corromper os registros. | Could | US-001, US-017 |
| US-020 | Exercícios estruturados de reflexão (TCC) | Apresentar etapas definidas e permitir salvar o resultado da atividade. | Could | US-009 |
| US-021 | Relatórios de progresso | Apresentar um resumo compreensível com dados reais, sem fazer diagnóstico. | Could | US-004, US-014 |

### Recursos da Sprint 3 implementados no código

- **Exportação e backup:** a API autenticada reúne registros de humor e diário; o app inclui metas, preferências, conquistas e registros pendentes em um arquivo JSON real. O arquivo pode ser compartilhado pelo sistema. A restauração lê um arquivo JSON, mostra a quantidade de registros antes de confirmar, mantém os dados atuais e ignora registros já importados. Limite: 1.000 entradas por arquivo.
- **Uso offline e sincronização:** novos registros de humor e diário entram na fila segura local quando a API não responde. O envio é tentado na inicialização, no retorno ao app, quando a conectividade volta e por ação manual em **Início → Progresso, dados e reflexão → Sincronizar agora**. Cada envio reutiliza um UUID para evitar duplicação quando a resposta da API se perde. A fila respeita o limite do SecureStore e informa quando não comporta um registro.
- **Metas e conquistas:** estado de bem-estar salvo localmente e sincronizado no backend, protegido por usuário. O servidor valida atividades e deriva os pontos das atividades concluídas, sem aceitar pontuação arbitrária.
- **Reflexão estruturada:** o exercício guiado apresenta etapas para situação, pensamento, emoção, evidências e próximo passo; a resposta é salva no diário.
- **Relatórios:** a tela de Progresso apresenta contagens e intensidade média calculadas a partir dos registros reais; o histórico exibe o gráfico semanal e mensal. O app não interpreta a intensidade como humor positivo/negativo nem faz diagnóstico.

O catálogo de profissionais está preparado com estado vazio e explica que o projeto não recebeu uma fonte verificável. Não há catálogo, agendamento ou atendimento. A tela de sugestões de apoio usa conteúdo fixo, sem modelo de IA; o botão ChatGPT apenas abre o site externo no navegador e não envia dados do app. Análise de sentimentos não está ativa. A lista básica de amizades e o QR estão implementados; espaços comunitários, denúncias/moderação e integrações com serviços continuam pendentes de requisitos e fontes definidos.

### Tarefas recentes adicionadas à Sprint 3

- **US-025 — ChatGPT externo na emergência:** botão abre `chatgpt.com` no navegador, com aviso de que IA não substitui atendimento profissional ou serviços de emergência. O CVV 188 permanece disponível.
- **US-026 — Refinamento visual:** atualização da paleta, dos cartões de humor, dos botões, da hierarquia da tela inicial e da navegação. Leitor de tela, contraste e escala ampliada ainda precisam de validação abrangente.
- **US-027 — Amizades e QR:** código pessoal e QR, leitura com câmera ou inserção manual, lista sincronizada e remoção de amizades. Validar o fluxo com duas contas.
- **US-028 — Execução Android por USB:** build instalada e aberta no Galaxy A14 com encaminhamento das portas para API e Metro. O README documenta a seleção do aparelho e os comandos de encaminhamento.

Antes da entrega final, valide notificações e compartilhamento/restauração de arquivos em dispositivo físico. Os testes automatizados e as checagens de build/typecheck são registrados abaixo apenas após sua execução neste ambiente.

### Backlog futuro — fora do escopo atual

| ID | Possibilidade | Condição para planejamento |
| --- | --- | --- |
| US-022 | Insights com IA e análise de padrões | Dispor de histórico suficiente, validar o modelo e comunicar suas limitações. |
| US-023 | Comunidade e espaços de apoio | Definir anonimato, denúncias, moderação e proteção de dados. |
| US-024 | Integrações com serviços e dispositivos | Definir APIs, permissões, privacidade e estratégia de sincronização. |

### Critérios para concluir cada entrega

- Verificar os critérios de aceite das histórias incluídas na sprint.
- Executar as verificações da seção **Testes e verificações** e, para mudanças na API ou persistência, `npm run api:test` com o PostgreSQL local ativo.
- Validar os fluxos alterados em dispositivo, incluindo estados vazios, carregamento e mensagens de erro aplicáveis.
- Atualizar este README e a planilha quando houver mudanças de escopo ou conclusão de histórias.

## Documentação adicional

- [Configuração do ambiente](CONFIGURACAO.md)
- [Documentação da API](backend/README.md)
- [Documentação do banco](database/README.md)
- [Expo SDK](https://docs.expo.dev/versions/latest/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
