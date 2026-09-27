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

### Prévia da Sprint 1

| ID | Épico | Entrega | Prioridade | Complexidade | Dependência |
| --- | --- | --- | --- | --- | --- |
| US-001 | Autenticação e Perfil | Criar conta, entrar e encerrar a sessão com segurança. | Must | M | — |
| US-002 | Autenticação e Perfil | Visualizar e editar os dados básicos do perfil. | Must | P | US-001 |
| US-003 | Humor e Diário | Registrar humor, intensidade e uma descrição opcional. | Must | M | US-001 |
| US-004 | Humor e Diário | Consultar o histórico de humor em lista e gráfico. | Must | M | US-003 |
| US-005 | Respiração e Relaxamento | Realizar um exercício guiado de respiração. | Must | M | — |
| US-007 | Ajuda e Segurança | Acessar informações e contatos de apoio em situações de crise. | Must | M | — |
| US-008 | Autoavaliação | Responder questionários e visualizar resultados informativos. | Should | M | US-001 |
| US-009 | Journaling | Criar, salvar e consultar registros de diário guiado. | Must | M | US-001 |

Os critérios de aceite completos estão na aba **Backlog Simplificado** da planilha. A aba **Sprints** apresenta o planejamento das demais versões.

## Documentação adicional

- [Configuração do ambiente](CONFIGURACAO.md)
- [Documentação da API](backend/README.md)
- [Documentação do banco](database/README.md)
- [Expo SDK](https://docs.expo.dev/versions/latest/)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
