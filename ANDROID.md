# APEX F1 — app Android (Capacitor)

A app Android é o mesmo site, empacotado com Capacitor. O código nativo está em
[android/](android/) e a configuração em [capacitor.config.json](capacitor.config.json).

## Atenção: o `webDir` é `dist`, não `.`

Pediste `webDir: "."`, mas este projeto é **Vite + React**: o `index.html` da raiz é
só o molde de desenvolvimento e aponta para `/src/main.tsx`, que o browser não
consegue executar (TSX por compilar). Com `"."` o APK abria num ecrã branco.

Por isso o Capacitor copia a pasta compilada:

```json
{ "appId": "com.apexf1.hub", "appName": "APEX F1", "webDir": "dist" }
```

## Comandos (copiar e colar, um bloco de cada vez)

```bash
# 1. dependências (já feitas neste repositório)
npm install
npm install @capacitor/core @capacitor/android
npm install -D @capacitor/cli

# 2. compilar o site e sincronizar com o projeto nativo
npm run build
npx cap sync android

# 3. abrir no Android Studio
npx cap open android
```

Os passos 2 e 3 têm atalhos no `package.json`:

```bash
npm run android:sync   # build + cap sync android
npm run android:open   # abre o Android Studio
```

Depois de alterar qualquer coisa no site, corre **`npm run android:sync`** antes de
compilar outra vez — o Android Studio compila a cópia que está em
`android/app/src/main/assets/public`, não o código-fonte.

Alternativa sem interface, com o SDK instalado:

```bash
cd android && ./gradlew assembleDebug     # Windows: gradlew.bat assembleDebug
```

Se disser `JAVA_HOME is not set`, aponta para o JDK do Android Studio:

```bash
export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
```

## Compilar o APK no Android Studio (4 cliques)

1. **`npx cap open android`** → o Android Studio abre `android/`.
   Espera que a barra de baixo diga **Gradle sync finished** (a primeira vez
   descarrega o Gradle 9.2.0, pode demorar minutos).
2. Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. Aparece um balão **APK(s) generated successfully** → clica **locate**.
4. O ficheiro está em:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Este APK já foi gerado e verificado nesta máquina: **4,8 MB**, pacote
`com.apexf1.hub`, nome **APEX F1**, minSdk 24, targetSdk 36, com o bundle web
dentro de `assets/public/` e o viewport sem zoom.

Para instalar e testar num telemóvel ligado por USB (depuração USB ativa):
escolhe o dispositivo na lista do topo e carrega no **▶ Run 'app'** verde.
O APK de debug é instalável fora da Play Store; para a loja é preciso
**Build → Generate Signed Bundle / APK**.

## Requisitos

| Ferramenta | Versão |
| --- | --- |
| Android Studio | Ladybug 2024.2.1 ou mais recente |
| JDK | 21 ou superior (o *JBR* do Android Studio, JDK 25, já foi testado) |
| Gradle | 9.2.0 (o wrapper descarrega sozinho) |
| SDK Platform | 36 (`compileSdk`/`targetSdk`) |
| SDK mínimo | Android 7.0 (API 24) |

Em **File → Settings → Languages & Frameworks → Android SDK** instala
*Android SDK Platform 36* e *Android SDK Build-Tools*.

## O que já está configurado

- **Navegação inferior** com as seis abas (Corrida, Sessões, Ao vivo,
  Classificação, Pilotos, F1 History) em ecrãs até 720 px — todas visíveis, sem
  scroll horizontal, com `env(safe-area-inset-bottom)` para a barra de gestos.
- **Mapa 3D**: zoom com pinça (dois dedos), roda do rato e botões **+/−** no canto
  inferior direito; um dedo continua a girar a câmara.
- Viewport sem zoom de página (`maximum-scale=1, user-scalable=no`) em [index.html](index.html).
- Nome **APEX F1**, ícone e splash padrão do Capacitor; o ícone próprio substitui-se
  em `android/app/src/main/res/mipmap-*/`.
- Modo escuro da app respeita a escolha guardada; o fundo nativo é `#07080b`.

## Login Google dentro da app

O Google recusa OAuth em WebViews (`disallowed_useragent`). Por isso o botão
“Entrar com o Google” no APK abre o consentimento no **browser do sistema**
(Custom Tabs), e o Clerk devolve o controlo à app pelo deep link
`com.apexf1.hub://sso-callback` — já registado no `AndroidManifest.xml` e tratado
em [nativeAuth.ts](src/lib/nativeAuth.ts) e [clerkBridge.tsx](src/lib/clerkBridge.tsx).

### Clerk: não há nada para configurar no painel

Testei a instância de desenvolvimento **Apex Hub** (`boss-seagull-9155.clerk.accounts.dev`):
`signIn.create` com `redirect_url=com.apexf1.hub://sso-callback` é aceite e devolve
logo o URL do Google, por isso **não é preciso mexer no Clerk Dashboard** para
chegar ao consentimento.

Não existe um ecrã “Allowed origins” no painel — `allowedOrigins` é um campo da API
de instância, não uma página. A página que existe é **Native applications**.

Só se o regresso à app ficar sem sessão (“O Google voltou à app sem a confirmação do
Clerk”) é que falta autorizar o endereço:

1. **https://dashboard.clerk.com** → aplicação **Apex Hub**
2. **Native applications** → **Allowlist for mobile SSO redirect**
3. Adiciona `com.apexf1.hub://sso-callback` e reinstala o APK
   (`npm run android:sync` → **Build → Build APK(s)**).

Fora do APK (site normal) o login continua a ser o redireccionamento de sempre — o
fluxo nativo só liga quando `Capacitor.isNativePlatform()` é verdadeiro.

O resto da app funciona sem rede: dados, mapa e arquivo vão dentro do APK.
