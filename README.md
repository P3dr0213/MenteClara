# Mente Clara

Aplicativo móvel de acompanhamento de bem-estar desenvolvido com React Native, TypeScript e Expo SDK 57. O projeto inclui autenticação, perfil, registro e histórico de humor, diário, exercício guiado de respiração, tema claro/escuro e recursos de ajuda.

> O Mente Clara é uma ferramenta de apoio ao bem-estar. Ele não substitui atendimento médico, psicológico ou serviços de emergência.

## Tecnologias

- Expo SDK 57 e React Native 0.86;
- TypeScript;
- Node.js e Express;
- PostgreSQL;
- `expo-secure-store` para guardar a sessão no aparelho;
- Jest para testes automatizados.

## Pré-requisitos

Instale [Node.js](https://nodejs.org/) 22.13 ou superior, Git e o [Expo Go](https://expo.dev/go) compatível com o SDK 57 no celular. O fluxo local do banco usa PowerShell no Windows.

Para executar pelo Wi-Fi, o celular e o computador precisam estar na mesma rede. Autorize o Node.js no Firewall do Windows para redes privadas quando o sistema solicitar.

## Instalação

Clone o repositório e entre na pasta:

```powershell
git clone URL_DO_REPOSITORIO
cd MenteClara
```

Instale as dependências:

```powershell
npm install
```

Na primeira execução, prepare o PostgreSQL e aplique as migrations:

```powershell
npm run db:setup
```

Esse comando cria o banco local e gera `backend/.env`. Os arquivos `.env`, `.local/` e `.local-logs/` são locais e não devem ser enviados ao Git.

## Executar no Expo Go pelo Wi-Fi

Use três terminais abertos na pasta do projeto.

No primeiro, inicie o banco:

```powershell
npm run db:start
```

No segundo, inicie a API para a rede local:

```powershell
npm run api:lan
```

No terceiro, inicie o Expo:

```powershell
npm start
```

Depois que o QR code aparecer:

1. Abra o Expo Go no celular.
2. Leia o QR code mostrado no terminal.
3. Aguarde a primeira compilação do bundle.
4. Se aparecer o menu azul de desenvolvimento, toque em **Continue** e feche-o pelo **X**.

Mantenha os três terminais abertos enquanto usar o aplicativo.

## Endereço da API

Pelo Wi-Fi, o aplicativo tenta localizar automaticamente o computador que executa o Metro. Se houver VPNs ou adaptadores virtuais e o Expo escolher o IP errado, copie o arquivo de exemplo:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e informe o IPv4 do computador:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
```

Descubra o endereço com `ipconfig` e use o IPv4 do adaptador conectado à mesma rede do celular. Reinicie o Expo depois da alteração. Variáveis `EXPO_PUBLIC_*` são públicas; não coloque senhas ou tokens nelas.

## Executar no Android por USB

Ative a depuração USB, conecte o aparelho e confirme a conexão:

```powershell
adb devices
```

No `.env`, use:

```dotenv
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001
```

Inicie o banco e a API local:

```powershell
npm run db:start
npm run api:start
```

Em outro terminal:

```powershell
npm run android:usb
```

## Comandos disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm start` | Inicia o Expo e exibe o QR code. |
| `npm run android` | Abre o projeto no Android conectado ou emulador. |
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

- 24 histórias de usuário e seus critérios de aceite;
- resumo do MVP, versões seguintes e itens futuros;
- distribuição por Sprint 1, Sprint 2 e Sprint 3;
- prioridade MoSCoW, complexidade e dependências;
- IA, comunidade e integrações avançadas fora do escopo atual.

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

## Documentação adicional

- [Configuração do ambiente](CONFIGURACAO.md)
- [Documentação da API](backend/README.md)
- [Documentação do banco](database/README.md)
- [Expo SDK](https://docs.expo.dev/versions/latest/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
