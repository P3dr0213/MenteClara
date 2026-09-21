# Ambiente de desenvolvimento — Mente Clara

Projeto React Native CLI com TypeScript, sem Expo, em `D:\Projetos\MenteClara`.

## Ferramentas

- React Native 0.87.1 / React 19.2.3 / Community CLI 20.2.0.
- Node 22.17.1 / npm 10.9.2.
- Temurin JDK 17.0.20.1 em `D:\Java\temurin-17.0.20.1`.
- Android SDK em `D:\androidStudio`, definido em `android/local.properties`.
- Gradle 9.4.1, disponibilizado pelo wrapper `android/gradlew.bat`.

O JDK foi copiado da raiz de D: para uma pasta própria. Nenhum arquivo da instalação original foi removido. Na raiz, Java informava `java.home=D:`, que era interpretado como caminho relativo pelo Gradle e causava erros de classes Java ausentes. `JAVA_HOME` do usuário e `org.gradle.java.home` em `android/gradle.properties` apontam para a cópia do mesmo JDK 17. Ao compartilhar o projeto com outro computador, ajuste essa última propriedade para o JDK local ou remova-a se `JAVA_HOME` já estiver correto.

## Executar no Android

Abra dois terminais na pasta do projeto. No primeiro:

```powershell
npm start
```

No segundo, com o celular autorizado para depuração USB:

```powershell
adb devices
npm run android
```

Para compilar apenas a arquitetura do celular conectado:

```powershell
npm run android -- --active-arch-only
```

Se necessário, restabeleça a conexão USB com o Metro:

```powershell
adb reverse tcp:8081 tcp:8081
```

Novos terminais recebem o `JAVA_HOME` atualizado. O projeto também fixa o caminho do JDK para funcionar em terminais que ainda tenham o valor antigo.

## Verificações

```powershell
npx react-native doctor
npx tsc --noEmit
npm test -- --runInBand
npm run lint
cd android
.\gradlew.bat --version
.\gradlew.bat app:assembleDebug -PreactNativeArchitectures=arm64-v8a
```

O Android Studio está em `D:\androidStudio\Nova pasta\bin\studio64.exe`. O Doctor pode não detectar essa instalação personalizada. Não é necessário reinstalar o IDE para corrigir apenas essa detecção.

Os diretórios `android/` e `ios/` foram gerados pelo template oficial. O ambiente Windows foi preparado para Android; o build iOS requer macOS/Xcode.

Referência: https://reactnative.dev/docs/getting-started-without-a-framework

## Ajustes adicionais e resultado do build

O cache do Gradle foi transferido, preservando seu conteúdo, de C:\Users\pemig\.gradle para D:\Gradle. O caminho antigo é um link para o novo, e GRADLE_USER_HOME do usuário aponta para D:\Gradle. Isso resolveu a falta de espaço no C: durante o download das dependências.

O SDK contém Build Tools 37.0.0, plataforma 37, NDK 27.1.12297006 e CMake 3.22.1. O comando Gradle assembleDebug terminou com BUILD SUCCESSFUL.

TypeScript, Jest (1 teste) e ESLint passaram.

O Doctor da CLI 20.2.0 ainda reporta SDK N/A com Command-line Tools 23: seu detector interpreta a saída antiga de sdkmanager --list, enquanto a ferramenta atual delega ao novo Android CLI e usa outro formato. A listagem direta do SDK e o build confirmaram os componentes instalados. O outro erro do Doctor é a detecção do Android Studio no caminho personalizado.

A tentativa de instalação no Redmi 12C reconhecido por ADB retornou INSTALL_FAILED_USER_RESTRICTED: Install canceled by user. O APK foi compilado, mas essa tentativa não instalou nem abriu o aplicativo. Desbloqueie o aparelho, autorize a instalação e, se necessário, habilite Instalar via USB nas Opções do desenvolvedor; depois execute npm run android -- --active-arch-only.

Instalação concluída na nova tentativa: adb install retornou Success. O aplicativo com.menteclara foi aberto no Redmi, seu processo foi confirmado e o Metro respondeu packager-status:running. O bloqueio de instalação relatado acima foi resolvido.
