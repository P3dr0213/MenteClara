# Configuração — Expo

O Mente Clara agora usa Expo SDK 57. Siga o [README](README.md) para executar pelo Expo Go, configurar Wi-Fi/USB e validar o projeto.

## Comandos principais

- `npm start`: inicia Expo e mostra o QR code.
- `npm run android`: abre no Android com Expo Go.
- `npm run ios`: abre no simulador iOS (macOS).
- `npm run api:lan`: inicia o backend acessível pelo Wi-Fi.
- `npm run api:start`: inicia o backend somente no computador.
- `npm run db:start`: inicia o PostgreSQL via Docker (porta 5433).

O Expo Go não exige compilar APK nem instalar JDK/Gradle. O PostgreSQL roda isolado via Docker Compose (`docker-compose.yml`), funcionando tanto no Linux quanto no Windows sem conflito de portas com outros serviços. Ambientes nativos anteriores em Windows foram mantidos apenas como referência histórica em `legacy-native/`.

Os projetos nativos antigos estão em `legacy-native/android` e `legacy-native/ios`. Seus caminhos relativos não devem ser usados para compilar a versão Expo. Use `npx expo prebuild` para gerar projetos novos e `npx expo run:android` para compilá-los.
