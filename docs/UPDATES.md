# LavaSuit - actualizaciones y releases

## Estado actual

- Desktop usa Electron + Vite + `electron-builder` + `electron-updater`.
- Mobile usa Expo SDK 54 + `expo-updates` + EAS channels.
- Backend no participa en la descarga de updates; solo mantiene licencias, datos, sync y API local.
- Los secretos siguen fuera del repo: usar `.env.example`, nunca `.env`, `DATABASE_URL` real, `JWT_SECRET` real ni `SUPABASE_SERVICE_ROLE_KEY`.

## Versionado

- `1.0.0`: primera version estable.
- `1.0.1`: bugfix compatible.
- `1.1.0`: feature compatible.
- `2.0.0`: cambio breaking.

Mantener sincronizados:

- Desktop: `desktop/package.json -> version`.
- Mobile: `mobile/app.json -> expo.version` y, si hay binario nuevo Android, subir `expo.android.versionCode`.
- Backend: `backend/package.json -> version` solo cuando haya release backend.

## Mobile OTA con Expo Updates

Configuracion activa:

- `mobile/app.json`
  - `runtimeVersion.policy = appVersion`
  - `updates.url = https://u.expo.dev/c5ce6661-8b9f-4a01-b77e-5f0e335b0638`
  - plugin `expo-updates`
- `mobile/eas.json`
  - `development -> channel development`
  - `preview -> channel preview`
  - `production -> channel production`

Regla operativa:

- Cambios JS/TS, estilos, pantallas y reglas no nativas: publicar OTA.
- Cambios nativos, permisos Android, plugins, dependencias nativas, Expo SDK, Bluetooth nativo, SQLite nativo o `runtimeVersion`: generar nuevo APK/AAB.

Comandos OTA:

```bash
cd mobile
npm run update:development -- --message "dev update"
npm run update:preview -- --message "preview update"
npm run update:production -- --message "production update"
```

Nuevo APK/AAB:

```bash
cd mobile
npm run build:apk
npm run build:aab
```

Prueba manual mobile:

- Abrir app instalada desde EAS, no Expo Go.
- Ir a Inicio.
- Confirmar version, build, canal y runtime.
- Pulsar `Buscar update`.
- Sin internet debe mostrar error claro y la app debe seguir operando offline.
- Con OTA disponible debe descargar y mostrar `Reiniciar`.
- Reiniciar y validar que SQLite, login offline, caja, pagos, Bluetooth e impresion siguen funcionando.

## Desktop GitHub Releases

Configuracion activa:

- `desktop/package.json`
  - `appId = com.lavasuit.desktop`
  - `publish.provider = github`
  - `publish.owner = santiagomontanes`
  - `publish.repo = lavasuit-tintureria`
  - target Windows `nsis x64`
- `.github/workflows/desktop-release.yml`
  - publica al empujar tags `desktop-v*.*.*`
  - usa `GH_TOKEN = secrets.GITHUB_TOKEN`

Publicacion local:

```bash
cd desktop
npm run build:publish
```

Publicacion por GitHub Actions:

```bash
cd C:\Users\USER\Desktop\lavasuit
git tag desktop-v1.0.1
git push origin desktop-v1.0.1
```

Prueba manual desktop:

- Instalar `LavaSuit-Setup-1.0.0.exe`.
- Publicar release superior, por ejemplo `1.0.1`.
- Abrir LavaSuit instalado.
- Confirmar version en el panel lateral.
- Pulsar `Buscar`.
- Descargar update.
- Pulsar `Reiniciar e instalar`.
- Confirmar que la base local `lavasuit.db`, licencias, caja e impresion siguen disponibles.

## Validaciones

Backend:

```bash
cd backend
node --check server.js
node --check src/app.js
npx prisma@5.22.0 validate
```

Desktop:

```bash
cd desktop
npm run typecheck
```

Mobile:

```bash
cd mobile
npm run typecheck
```

