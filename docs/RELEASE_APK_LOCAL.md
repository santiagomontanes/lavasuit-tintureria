# Build APK Release Local — LavaSuit Mobile

Procedimiento para generar un APK firmado release sin EAS, usando solo Gradle local.

> **Requisitos previos:** Android Studio, Java 17 (JDK), Android SDK y `adb` configurados.
> **Package:** `com.lavasuit.app` (no modificar).
> **Compatible con:** `expo run:android` sigue funcionando (debug usa su propio keystore).

## ⚠ Sobre la persistencia de los cambios

`mobile/android/` está ignorado por `mobile/.gitignore` (convención Expo prebuild). Por eso la configuración de firma vive en dos lugares:

1. **Plugin Expo** `mobile/plugins/withReleaseSigning.js` (TRACKEADO) — re-inyecta la configuración cada vez que se regenera `android/` con `expo prebuild`.
2. **Edición directa** de `mobile/android/app/build.gradle` (NO trackeada) — para que funcione AHORA sin tener que correr prebuild.

El plugin está registrado en `mobile/app.json → plugins`. Si alguna vez corres `expo prebuild --clean`, el plugin re-aplica la configuración automáticamente.

---

## 1. Generar el keystore release (una sola vez)

⚠ **El keystore es ÚNICO.** Si lo perdés, no podrás actualizar la app firmada con él (Google Play / instalación encima exigen misma firma).

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile\android\app

keytool -genkeypair -v `
  -keystore lavasuit-release.jks `
  -alias lavasuit `
  -keyalg RSA -keysize 2048 `
  -validity 10950 `
  -dname "CN=LavaSuit, OU=Mobile, O=LavaSuit, L=Bogota, S=Bogota, C=CO"
```

- `keystore`: archivo `.jks` (gitignored).
- `alias`: identificador de la clave dentro del keystore (`lavasuit`).
- `validity 10950`: 30 años (Google Play exige ≥ 25 años).
- Te pedirá interactivamente:
  - **Keystore password** — anotala en gestor de contraseñas
  - **Key password** (puede ser igual al anterior)

✅ Verificar:

```powershell
keytool -list -v -keystore lavasuit-release.jks -storepass "TU_PASSWORD"
```

⚠ **Backup obligatorio.** Copiar `lavasuit-release.jks` y las passwords a:
- USB cifrado guardado fuera de la oficina
- Gestor de contraseñas (1Password, Bitwarden) como adjunto
- Documento de credenciales del proyecto

---

## 2. Crear `keystore.properties`

La plantilla está en `mobile/keystore.properties.example` (trackeada en git). El archivo real va en `mobile/android/keystore.properties` (ignorado).

```powershell
copy C:\Users\USER\Desktop\lavasuit\mobile\keystore.properties.example `
     C:\Users\USER\Desktop\lavasuit\mobile\android\keystore.properties
```

Editar `mobile/android/keystore.properties` con valores reales:

```properties
storeFile=lavasuit-release.jks
storePassword=TU_KEYSTORE_PASSWORD
keyAlias=lavasuit
keyPassword=TU_KEY_PASSWORD
```

✅ `keystore.properties` está gitignored — verificar con `git status` que NO aparezca.

> 💡 `storeFile` puede ser absoluto: `storeFile=C:/Users/USER/Keystores/lavasuit-release.jks` (usar `/` aunque seas Windows). Útil para guardar el `.jks` fuera del repo.

---

## 3. Generar el APK release

Desde la raíz de `mobile/`:

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm run build:apk:local
```

Equivale a:

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile\android
.\gradlew assembleRelease
```

Tiempo estimado: **5-15 minutos** la primera vez (descarga dependencias Gradle), 2-5 min en builds siguientes.

✅ Output:

```
C:\Users\USER\Desktop\lavasuit\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Otros artefactos generados en la misma carpeta:
- `app-release.apk` — el que vas a distribuir
- `output-metadata.json` — metadata Gradle

---

## 4. Validar que sea release y no debug

### 4.1 Verificar firma del APK

```powershell
keytool -printcert -jarfile C:\Users\USER\Desktop\lavasuit\mobile\android\app\build\outputs\apk\release\app-release.apk
```

✅ **Release correcto** muestra algo como:
```
Owner: CN=LavaSuit, OU=Mobile, O=LavaSuit, L=Bogota, ST=Bogota, C=CO
Issuer: CN=LavaSuit, OU=Mobile, O=LavaSuit, ...
Valid from: ... until: 2056-xx-xx
```

❌ **Si dice esto está mal firmado (debug):**
```
Owner: C=US, O=Android, CN=Android Debug
```

### 4.2 Verificar build type via aapt (opcional)

Si tenés `build-tools` en PATH:

```powershell
aapt dump badging app-release.apk | findstr "package:"
```

Debe mostrar `package: name='com.lavasuit.app' versionCode='2' versionName='1.0.1'`.

### 4.3 Verificar firma APK v2/v3 con apksigner

```powershell
$apksigner = "$env:ANDROID_HOME\build-tools\34.0.0\apksigner.bat"
& $apksigner verify --print-certs C:\Users\USER\Desktop\lavasuit\mobile\android\app\build\outputs\apk\release\app-release.apk
```

(Reemplazar `34.0.0` por la versión instalada en tu `build-tools/`.)

---

## 5. Instalar el APK release en un celular

```powershell
adb install -r C:\Users\USER\Desktop\lavasuit\mobile\android\app\build\outputs\apk\release\app-release.apk
```

Si el celular tiene una versión previa firmada con OTRO keystore (ej. debug o EAS anterior), `adb install` falla con `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. Solución:

```powershell
adb uninstall com.lavasuit.app
adb install C:\Users\USER\Desktop\lavasuit\mobile\android\app\build\outputs\apk\release\app-release.apk
```

⚠ Desinstalar borra los datos locales de la app (SQLite, sesión, configuración).

---

## 6. Limpiar build (si algo falla)

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile\android
.\gradlew clean
```

Luego reintentar `npm run build:apk:local`.

---

## 7. Diferencia entre los scripts mobile

| Script | Qué hace | Firma | Usa EAS |
|--------|----------|-------|---------|
| `npm run android` | Build debug + corre en USB | debug.keystore | No |
| `npm run build:apk` | APK preview en EAS cloud | EAS | Sí |
| `npm run build:apk:local` | **APK release firmado local** | lavasuit-release.jks | **No** |
| `npm run build:aab` | AAB producción en EAS cloud | EAS | Sí |
| `npm run update:preview` | OTA bundle al canal preview | n/a | Sí |

---

## 8. Antes de cada release release-local

- [ ] Editar `mobile/app.json` → `expo.version` y `expo.android.versionCode` incrementados
- [ ] Editar `mobile/app.json` → `extra.apiHost` con la IP del cliente
- [ ] `mobile/android/keystore.properties` existe y NO está en git
- [ ] `lavasuit-release.jks` existe
- [ ] `npm run typecheck` pasa sin errores

---

## 9. Errores comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `keystore.properties no encontrado` (warning) | Falta el archivo | Sección 2 |
| `keytool: command not found` | JDK no en PATH | Agregar `%JAVA_HOME%\bin` al PATH |
| `gradlew: command not found` | Estás fuera de `mobile/android/` | `cd android` primero |
| `SDK location not found` | Falta `ANDROID_HOME` o `mobile/android/local.properties` | Crear `local.properties` con `sdk.dir=C:\\Users\\USER\\AppData\\Local\\Android\\Sdk` |
| `Execution failed... PackagingException` | Conflicto de assets duplicados | `.\gradlew clean` y rebuild |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | Versión instalada con otra firma | `adb uninstall com.lavasuit.app` |
| `INSTALL_PARSE_FAILED_NO_CERTIFICATES` | APK no firmado | Verificar que `hasReleaseKeystore` se evaluó true (log de Gradle) |
| Build tarda > 30 min | Primera vez Gradle descarga dependencias | Esperar, las siguientes son más rápidas |

---

## 10. Rotación / pérdida del keystore

Si perdés `lavasuit-release.jks`:
- **NO podrás** subir un update encima del APK existente — el celular rechazará la instalación con firma distinta.
- La única salida es **cambiar el `applicationId`** (ej. `com.lavasuit.app.v2`) y distribuir como app nueva, lo que obliga a los clientes a desinstalar la versión vieja y perder datos locales.

**Por eso el backup del `.jks` es crítico.** Guardar en mínimo 2 ubicaciones físicas distintas + gestor de contraseñas.

---

## 11. Archivos modificados por esta configuración

### Trackeados en git

| Archivo | Cambio | Repo |
|---------|--------|------|
| `mobile/plugins/withReleaseSigning.js` | **NUEVO** — Config plugin que inyecta el signing config en build.gradle |  mobile |
| `mobile/app.json` | Plugin registrado en `expo.plugins` | mobile |
| `mobile/keystore.properties.example` | **NUEVO** — Plantilla pública | mobile |
| `mobile/package.json` | Agregado script `build:apk:local` | mobile |
| `.gitignore` (raíz) | Agregadas rutas keystore/jks (defensa en profundidad) | lavasuit |
| `docs/RELEASE_APK_LOCAL.md` | **NUEVO** — Este documento | lavasuit |

### NO trackeados (locales, ignorados)

| Archivo | Razón |
|---------|-------|
| `mobile/android/app/build.gradle` | `/android` está en `mobile/.gitignore`. El plugin regenera estos cambios en cada `expo prebuild`. Edición manual solo aplica a esta máquina. |
| `mobile/android/keystore.properties` | Contiene passwords. Ignorado por `/android` + reglas explícitas. |
| `mobile/android/app/lavasuit-release.jks` | Clave privada. Ignorado por `*.jks` en `mobile/.gitignore` + `/android`. |

### Para que otra persona del equipo pueda generar APKs release

1. Clonar el repo y submodule `mobile/`
2. `cd mobile && npm install`
3. `npx expo prebuild` (el plugin `withReleaseSigning` inyecta el signing config en el `android/` recién generado)
4. Copiar `keystore.properties.example` a `android/keystore.properties` y completar
5. Conseguir el `.jks` por canal seguro (NO email/git)
6. `npm run build:apk:local`
