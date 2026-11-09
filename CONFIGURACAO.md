# Configuração — Expo

O Mente Clara usa Expo SDK 57 e uma build de desenvolvimento nativa para validar recursos como armazenamento seguro e leitura de QR pela câmera. Siga o [README](README.md) para instalar em Android e configurar Wi-Fi ou USB.

## Comandos principais

- `npm start`: inicia Expo e mostra o QR code.
- `npm run android -- --device`: compila/instala a build de desenvolvimento e permite escolher um Android conectado.
- `npm run ios`: abre no simulador iOS (macOS).
- `npm run api:lan`: inicia o backend acessível pelo Wi-Fi.
- `npm run api:start`: inicia o backend somente no computador.
- `npm run db:start`: inicia o PostgreSQL via Docker (porta padrão 5433, salvo configuração local diferente).

O PostgreSQL roda isolado via Docker Compose (`docker-compose.yml`). A porta padrão é 5433; se outra aplicação estiver usando essa porta, ajuste a publicação local antes de executar `npm run db:setup`. Para builds Android locais, mantenha instalados Android SDK, platform-tools e o JDK configurado para o projeto. Ambientes nativos anteriores estão em `legacy-native/` apenas como referência histórica.

Os projetos nativos antigos estão em `legacy-native/android` e `legacy-native/ios`. Seus caminhos relativos não devem ser usados para compilar a versão Expo. Use `npx expo prebuild` para gerar projetos novos e `npx expo run:android` para compilá-los.
