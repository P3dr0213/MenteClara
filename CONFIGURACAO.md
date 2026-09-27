# Configuração — Expo

O Mente Clara agora usa Expo SDK 57. Siga o [README](README.md) para executar pelo Expo Go, configurar Wi-Fi/USB e validar o projeto.

## Comandos principais

- `npm start`: inicia Expo e mostra o QR code.
- `npm run android`: abre no Android com Expo Go.
- `npm run ios`: abre no simulador iOS (macOS).
- `npm run api:lan`: inicia o backend acessível pelo Wi-Fi.
- `npm run api:start`: inicia o backend somente no computador.
- `npm run db:start`: inicia o PostgreSQL local existente.

O Expo Go não exige compilar APK nem instalar JDK/Gradle. O ambiente Android anterior foi preservado: SDK em `D:\androidStudio`, JDK em `D:\Java\temurin-17.0.20.1` e cache Gradle em `D:\Gradle`. Esses componentes só são necessários para builds nativos locais.

Os projetos nativos antigos estão em `legacy-native/android` e `legacy-native/ios`. Seus caminhos relativos não devem ser usados para compilar a versão Expo. Use `npx expo prebuild` para gerar projetos novos e `npx expo run:android` para compilá-los.
