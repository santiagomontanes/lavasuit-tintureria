# LavaSuit — Manual de Instalación y Entrega al Cliente

**Documento:** Manual técnico oficial de despliegue
**Versión del manual:** 1.0.0
**Fecha de emisión:** 2026-05-18
**Proyecto:** LavaSuit — Sistema de gestión para tintorerías
**Repositorio:** https://github.com/santiagomontanes/lavasuit-tintureria
**Autor:** Equipo LavaSuit
**Audiencia:** Personal técnico de implementación

---

## Índice

1. [Información del manual](#1-información-del-manual)
2. [Visión general del sistema](#2-visión-general-del-sistema)
3. [Preparación previa a la instalación](#3-preparación-previa-a-la-instalación)
4. [Generar instalador Desktop (.exe)](#4-generar-instalador-desktop-exe)
5. [Generar APK Android](#5-generar-apk-android)
6. [Instalar el servidor en el PC del cliente](#6-instalar-el-servidor-en-el-pc-del-cliente)
7. [Backend como servicio de Windows (PM2)](#7-backend-como-servicio-de-windows-pm2)
8. [MySQL en producción](#8-mysql-en-producción)
9. [Configurar el Desktop en el cliente](#9-configurar-el-desktop-en-el-cliente)
10. [Configurar el móvil en el cliente](#10-configurar-el-móvil-en-el-cliente)
11. [Flujo de actualizaciones](#11-flujo-de-actualizaciones)
12. [Checklist completo de entrega](#12-checklist-completo-de-entrega)
13. [Troubleshooting completo](#13-troubleshooting-completo)
14. [Soporte post-venta](#14-soporte-post-venta)
15. [Anexo A — Plantilla `.env`](#anexo-a--plantilla-env)
16. [Anexo B — Plantilla `setup.sql`](#anexo-b--plantilla-setupsql)
17. [Anexo C — Plantilla `backup.bat`](#anexo-c--plantilla-backupbat)
18. [Anexo D — Plantilla acta de entrega](#anexo-d--plantilla-acta-de-entrega)
19. [Anexo E — Plantilla credenciales](#anexo-e--plantilla-credenciales)
20. [Anexo F — Diagrama de red](#anexo-f--diagrama-de-red)
21. [Anexo G — Comandos de referencia rápida](#anexo-g--comandos-de-referencia-rápida)
22. [Anexo H — Estructura de archivos](#anexo-h--estructura-de-archivos)
23. [Anexo I — Mejoras pendientes recomendadas](#anexo-i--mejoras-pendientes-recomendadas)

---

## 1. Información del manual

### 1.1 Propósito

Este manual documenta el procedimiento completo para:

- Compilar los binarios distribuibles (instalador Windows y APK Android)
- Instalar y configurar el servidor backend en el PC de un cliente
- Configurar los puestos de trabajo (desktop y dispositivos móviles)
- Operar el sistema de actualizaciones
- Entregar al cliente con todas las verificaciones realizadas

### 1.2 Audiencia

Personal técnico de implementación con conocimientos básicos de:

- Línea de comandos Windows (PowerShell / CMD)
- Conceptos de red local (IP, puerto, firewall)
- Administración básica de MySQL
- Git y GitHub

### 1.3 Convenciones del documento

| Símbolo | Significado |
|---------|-------------|
| `comando` | Comando a ejecutar literalmente |
| `C:\Ruta\archivo` | Ruta absoluta de Windows |
| **⚠ Atención** | Advertencia importante (riesgo de pérdida de datos o fallo) |
| **💡 Tip** | Recomendación o atajo útil |
| **❌ Prohibido** | Acción que NO debe realizarse |
| **✅ Verificación** | Paso de validación obligatorio |

### 1.4 Glosario

| Término | Definición |
|---------|------------|
| **Backend** | Servidor Node.js + Express que expone la API REST y WebSocket |
| **Desktop** | Aplicación Windows Electron usada por administrador/mostrador |
| **Mobile** | Aplicación Android React Native usada por operarios en campo |
| **PM2** | Gestor de procesos Node.js para mantener el backend corriendo |
| **OTA** | Over The Air — actualización remota sólo del bundle JavaScript |
| **APK** | Paquete instalable de Android |
| **EAS** | Expo Application Services — sistema de build en la nube |
| **NSIS** | Nullsoft Scriptable Install System — formato de instalador Windows |
| **LAN** | Red local |

---

## 2. Visión general del sistema

### 2.1 Componentes

| Componente | Tecnología | Ubicación | Función |
|------------|------------|-----------|---------|
| **Backend** | Node.js 20 + Express + Prisma + MySQL | PC servidor del cliente | API REST, WebSocket, persistencia |
| **MySQL** | 8.0 Community Server | PC servidor del cliente | Base de datos relacional |
| **Desktop** | Electron 41 + React 19 + Vite + Tailwind | PC del administrador | Interfaz de gestión completa |
| **Mobile** | Expo SDK 54 + React Native 0.81 | Celulares Android del personal | Toma de pedidos, cobros, impresión |
| **SQLite (mobile)** | expo-sqlite | Celular | Cache offline + cola de sincronización |
| **Supabase** | PostgreSQL cloud | Compartido entre clientes | Sistema centralizado de licencias |
| **GitHub Releases** | Servicio GitHub | Cloud | Distribución de actualizaciones Desktop |
| **EAS Update** | Expo cloud | Cloud | Distribución OTA Mobile |

### 2.2 Arquitectura

```
                    ┌─────────────────────────────────────┐
                    │   SUPABASE CLOUD                    │
                    │   (Sistema de licencias)            │
                    └─────────────────┬───────────────────┘
                                      │ HTTPS (sólo backend)
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│  PC SERVIDOR DEL CLIENTE (Windows 10/11)                    │
│                                                              │
│  ┌─────────────────┐     ┌──────────────────────────────┐  │
│  │ MySQL 8.0       │◀────│ Backend Node.js              │  │
│  │ lavasuit_db     │     │ Express + Socket.io          │  │
│  │ localhost:3306  │     │ Puerto 3000 (LAN abierta)    │  │
│  └─────────────────┘     │ Gestionado por PM2           │  │
│                          └──────┬────────────────┬──────┘  │
└─────────────────────────────────┼────────────────┼─────────┘
                                  │                │
                          WiFi LAN│                │WiFi LAN
                                  │                │
            ┌─────────────────────┘                └──────────┐
            ▼                                                  ▼
   ┌──────────────────┐                          ┌──────────────────┐
   │ Desktop Electron │                          │ Mobile Android   │
   │ (admin/caja)     │                          │ (operarios)      │
   │                  │                          │ + SQLite offline │
   │                  │                          │ + Impresora BT   │
   └──────────────────┘                          └──────────────────┘
```

### 2.3 Flujo de datos

1. **Lectura online (mobile/desktop):** request HTTP a `http://<IP_SERVIDOR>:3000/api/...`
2. **Lectura offline (mobile):** consulta directa a SQLite local
3. **Escritura online (desktop):** request HTTP → MySQL → emit Socket.io a todos los clientes
4. **Escritura offline (mobile):** insert local + push a `sync_queue` → al volver conexión envía en orden
5. **Realtime:** cambios en backend disparan eventos `socket.io` que clientes reciben en vivo
6. **Licencias:** verificación contra Supabase con `LICENSE_GRACE_DAYS` de gracia offline

### 2.4 Puertos y protocolos

| Puerto | Protocolo | Origen | Destino | Función |
|--------|-----------|--------|---------|---------|
| 3000 | TCP (HTTP) | Desktop/Mobile | Backend | API REST + WebSocket |
| 3306 | TCP | Backend | MySQL | Conexión a base de datos |
| 443 | TCP (HTTPS) | Backend | Supabase | Verificación de licencias |
| 5353 | UDP | mDNS | LAN | Descubrimiento automático (opcional) |

### 2.5 Requisitos mínimos

#### PC servidor (cliente)

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| Sistema operativo | Windows 10 Pro 64-bit | Windows 11 Pro 64-bit |
| Procesador | Intel i3 8th gen / AMD Ryzen 3 | Intel i5 10th gen / AMD Ryzen 5 |
| RAM | 4 GB | 8 GB |
| Almacenamiento | 50 GB libres SSD | 250 GB SSD |
| Red | WiFi b/g/n o Ethernet | WiFi 5 + Ethernet Gigabit |
| UPS | No obligatorio | **Sí, recomendado** |

#### PC desktop adicional (opcional, distinto del servidor)

| Recurso | Mínimo |
|---------|--------|
| Sistema operativo | Windows 10 64-bit |
| RAM | 4 GB |
| Resolución | 1366×768 |

#### Celulares operarios

| Recurso | Mínimo |
|---------|--------|
| Sistema operativo | Android 8.0 (API 26) |
| RAM | 2 GB |
| Almacenamiento libre | 500 MB |
| Bluetooth | 4.0+ (para impresora térmica) |
| WiFi | b/g/n |

#### Impresora térmica

- Bluetooth 4.0+
- Ancho de papel 58 mm o 80 mm
- Comandos ESC/POS estándar
- Modelos validados: Xprinter XP-58, MUNBYN P-58, GOOJPRT PT-210

---

## 3. Preparación previa a la instalación

### 3.1 Información a recolectar del cliente

Antes de ir al sitio, completar este formulario con el cliente:

| Dato | Ejemplo | Notas |
|------|---------|-------|
| Razón social | Tintorería La Esquina S.A.S. | Para licencia y facturación |
| Domicilio de instalación | Calle 123 #45-67 | Dirección física |
| Marca/modelo PC servidor | Lenovo IdeaCentre 5 | Para validar requisitos |
| Sistema operativo PC servidor | Windows 11 Pro | Versión y edición |
| Router WiFi modelo | TP-Link Archer C6 | Para configurar IP fija |
| Rango IP del router | 192.168.1.x | Identifica subred LAN |
| IP fija propuesta para servidor | 192.168.1.10 | Fuera del rango DHCP |
| Cantidad de móviles operarios | 3 | Cuántos APKs configurar |
| Marca/modelo impresora térmica | Xprinter XP-58 | Para validar compatibilidad |
| Cuenta de correo del admin | admin@cliente.com | Para envío de credenciales |
| Teléfono soporte cliente | +57 300 000 0000 | Contacto técnico |

### 3.2 Kit técnico a llevar

#### Software (en USB)

- [ ] `LavaSuit-Setup-X.Y.Z.exe` (instalador desktop más reciente)
- [ ] `lavasuit-cliente.apk` (APK compilado con la IP del cliente)
- [ ] Node.js 20 LTS — instalador offline (https://nodejs.org/dist/v20.19.0/node-v20.19.0-x64.msi)
- [ ] MySQL 8.0 Community Server — instalador offline (`mysql-installer-community-8.0.X.msi`)
- [ ] Backend empaquetado: carpeta `backend/` sin `node_modules`, con `package-lock.json`
- [ ] Script `setup.sql` (Anexo B)
- [ ] Script `backup.bat` (Anexo C)
- [ ] AnyDesk o TeamViewer (instalador para soporte remoto futuro)

#### Hardware

- [ ] Cable Ethernet RJ-45 de respaldo (5 m)
- [ ] Adaptador USB-RJ45
- [ ] Pendrive USB de respaldo (16 GB+)
- [ ] Cable de extensión eléctrica
- [ ] Etiquetadora para identificar IPs en equipos

#### Documentos

- [ ] Acta de entrega impresa (Anexo D)
- [ ] Plantilla de credenciales (Anexo E)
- [ ] Este manual impreso o en tablet

### 3.3 Credenciales y cuentas requeridas

| Cuenta | Para qué | Quién la genera |
|--------|----------|-----------------|
| GitHub `santiagomontanes` | Releases desktop + Actions | Ya existe |
| Expo / EAS | Build APK + OTA | Ya existe |
| Supabase | Activar licencias | Ya existe (`awutehzbhhklcgodmluq.supabase.co`) |
| Código de licencia LavaSuit | Activar instalación del cliente | Generar antes de ir |
| Password MySQL del cliente | Acceso a `lavasuit_user` | Generar único por cliente (sección 6) |
| `JWT_SECRET` del cliente | Firmar tokens del backend | Generar único por cliente (sección 6) |
| Password admin LavaSuit | Login inicial al sistema | Generar único por cliente |

---

## 4. Generar instalador Desktop (.exe)

### 4.1 Prerequisitos en PC desarrollador

| Software | Versión | Cómo verificar |
|----------|---------|----------------|
| Node.js | ≥ 20.0.0 | `node --version` |
| npm | ≥ 10.0.0 | `npm --version` |
| Git | ≥ 2.40 | `git --version` |
| Cuenta GitHub con acceso al repo | — | `gh auth status` o login web |

### 4.2 Validaciones previas obligatorias

```powershell
cd C:\Users\USER\Desktop\lavasuit\desktop
npm install
npm run typecheck
```

✅ `typecheck` debe finalizar sin errores. Si hay errores TypeScript, **no continuar** con el build.

### 4.3 Build local sin publicar

```powershell
cd C:\Users\USER\Desktop\lavasuit\desktop
npm run build:installer
```

**Resultado esperado:**

```
C:\Users\USER\Desktop\lavasuit\desktop\dist\electron\
  ├── LavaSuit-Setup-1.0.0.exe        ← instalador NSIS
  ├── LavaSuit-Setup-1.0.0.exe.blockmap
  └── latest.yml                       ← metadata para auto-updater
```

✅ El `.exe` debe pesar entre 90 y 150 MB.

### 4.4 Build y publicación a GitHub Releases (local)

Requiere variable de entorno con token de GitHub con scope `repo`:

```powershell
$env:GH_TOKEN = "ghp_TU_TOKEN_PERSONAL_AQUI"
cd C:\Users\USER\Desktop\lavasuit\desktop
npm run build:publish
```

El script ejecuta internamente:
1. `vite build` — compila el renderer React
2. `electron-builder --win --publish always` — empaqueta y sube al Release

### 4.5 Build y publicación vía GitHub Actions (recomendado)

El workflow `.github/workflows/desktop-release.yml` se dispara automáticamente al empujar un tag con formato `desktop-vX.Y.Z`.

#### Paso 1 — Actualizar versión

Editar `desktop/package.json`:

```json
{
  "name": "lavasuit-desktop",
  "version": "1.0.1",   ← cambiar aquí
  ...
}
```

#### Paso 2 — Commit y push

```powershell
cd C:\Users\USER\Desktop\lavasuit
git add desktop/package.json
git commit -m "release desktop v1.0.1"
git push origin main
```

#### Paso 3 — Crear y empujar tag

```powershell
git tag desktop-v1.0.1
git push origin desktop-v1.0.1
```

#### Paso 4 — Monitorear el build

Abrir en navegador:
```
https://github.com/santiagomontanes/lavasuit-tintureria/actions
```

El workflow tarda 8-12 minutos. Al terminar verás un release nuevo en:
```
https://github.com/santiagomontanes/lavasuit-tintureria/releases
```

✅ El release debe contener: `LavaSuit-Setup-X.Y.Z.exe`, `latest.yml`, `LavaSuit-Setup-X.Y.Z.exe.blockmap`.

### 4.6 Verificación del instalador

Antes de entregar al cliente:

1. Copiar `LavaSuit-Setup-X.Y.Z.exe` a un PC limpio (preferible máquina virtual).
2. Ejecutar el `.exe` → debe abrir wizard NSIS en español.
3. Instalar en `C:\Program Files\LavaSuit` o ruta personalizada.
4. Verificar que se creó atajo en escritorio y menú inicio.
5. Abrir LavaSuit → debe mostrar pantalla de licencia o login.
6. Cerrar y desinstalar → desinstalador debe estar disponible en Panel de Control.
7. Re-instalar → confirmar que datos previos (en `%APPDATA%\LavaSuit\lavasuit.db`) sobreviven.

### 4.7 Versionado semántico

| Tipo de cambio | Incremento | Ejemplo |
|----------------|------------|---------|
| Bug fix sin cambios de interfaz | Patch | `1.0.0` → `1.0.1` |
| Nueva funcionalidad compatible | Minor | `1.0.1` → `1.1.0` |
| Cambio que rompe migración o API | Major | `1.1.0` → `2.0.0` |

⚠ Cada release debe tener notas en el body de GitHub Release explicando:
- Funcionalidades agregadas
- Bugs corregidos
- Cambios que requieren acción del cliente

### 4.8 Errores comunes al generar el .exe

| Error | Causa | Solución |
|-------|-------|----------|
| `electron-builder: command not found` | Falta `npm install` | `cd desktop && npm install` |
| `Cannot find module 'better-sqlite3'` | Módulo nativo no compiló | Reinstalar Node 20 LTS; reinstalar dependencias |
| `Error: Cannot create symbolic link, code: EPERM` | Faltan permisos | Ejecutar PowerShell como administrador |
| `GitHub: 401 Unauthorized` | Token sin scope `repo` o expirado | Regenerar token en GitHub Settings |
| `latest.yml` no se sube | `publish: always` no estaba activo | Usar `npm run build:publish`, no `build` |
| `.exe` muy pequeño (<50MB) | Faltó `vite build` previo | Asegurarse de que `dist/renderer` exista |

---

## 5. Generar APK Android

### 5.1 Prerequisitos

| Software | Versión |
|----------|---------|
| Node.js | ≥ 20.0.0 |
| Expo CLI | última (vía `npx expo`) |
| EAS CLI | ≥ 5.0.0 |
| Cuenta Expo activa | — |

```powershell
npm install -g eas-cli
eas --version
```

### 5.2 Login en EAS

```powershell
eas login
# Email: tu cuenta Expo
# Password: tu password
```

✅ Verificar:

```powershell
eas whoami
```

### 5.3 Configuración crítica — `apiHost`

⚠ **ESTE ES EL PASO MÁS IMPORTANTE.** La IP del backend está hardcodeada en el bundle compilado del APK. Cada cliente necesita su propio APK con su IP LAN.

Editar `mobile/app.json`:

```json
{
  "expo": {
    "version": "1.0.1",
    "android": {
      "versionCode": 3
    },
    "extra": {
      "apiHost": "192.168.1.10",      ← IP fija del servidor del cliente
      "apiPort": 3000,
      "apiProtocol": "http",
      "syncIntervalMs": 15000,
      "syncMaxRetries": 5,
      "enableThermalBluetooth": true,
      "buildLabel": "cliente-tintoreria-laesquina-2026-05-18",
      "eas": {
        "projectId": "c5ce6661-8b9f-4a01-b77e-5f0e335b0638"
      }
    }
  }
}
```

⚠ **Reglas:**
- Incrementar `version` ante cualquier cambio nativo
- Incrementar `versionCode` (entero) en cada build subido a tienda
- `apiHost` debe coincidir EXACTAMENTE con la IP fija configurada en sección 6.9
- `buildLabel` para identificar el APK en logs y reportes

### 5.4 Validaciones previas

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm install
npm run typecheck
```

✅ `typecheck` debe finalizar sin errores.

### 5.5 Compilar APK preview (entregable)

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm run build:apk
```

Internamente ejecuta: `eas build --profile preview --platform android`.

El build corre en la nube de EAS. Verás algo como:

```
✔ Build started, it may take a few minutes to complete.
✔ You can monitor the build at https://expo.dev/accounts/.../builds/xxx
```

Tiempo estimado: **10 a 20 minutos**.

### 5.6 Descargar el APK desde EAS

Al finalizar el build, EAS proporciona una URL:

```
https://expo.dev/artifacts/eas/xxxxxxxxxxxxxxxxxx.apk
```

Descargar el `.apk` con el navegador y renombrarlo a:

```
lavasuit-<cliente>-v<version>.apk
```

Ejemplo: `lavasuit-laesquina-v1.0.1.apk`

### 5.7 Verificación del APK

1. Conectar celular Android al PC vía USB.
2. Activar "Depuración USB" en Opciones de desarrollador.
3. Instalar con ADB (opcional):
   ```powershell
   adb install lavasuit-laesquina-v1.0.1.apk
   ```
4. O transferir al celular y abrir el `.apk` desde explorador.
5. Verificar que la app abre sin crashear.
6. Pantalla de configuración debe mostrar la IP `192.168.1.10:3000` correctamente.

### 5.8 OTA Updates vs APK nuevo — Tabla de decisión

| Tipo de cambio | Acción correcta | Comando |
|----------------|-----------------|---------|
| Cambio de texto / etiqueta / mensaje | **OTA** | `npm run update:preview` |
| Cambio de estilos / colores / layout | **OTA** | `npm run update:preview` |
| Nueva pantalla / lógica TS / validación | **OTA** | `npm run update:preview` |
| Bugfix de sincronización / caja / pagos | **OTA** | `npm run update:preview` |
| Cambio de `apiHost` en `app.json extra` | **APK nuevo** | `npm run build:apk` |
| Cambio de `permissions` Android | **APK nuevo** | `npm run build:apk` |
| Upgrade de SDK Expo | **APK nuevo** | `npm run build:apk` |
| Cambio de dependencia nativa (Bluetooth, SQLite) | **APK nuevo** | `npm run build:apk` |
| Cambio en `plugins` o `runtimeVersion` | **APK nuevo** | `npm run build:apk` |

### 5.9 Publicar OTA al canal preview

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm run update:preview -- --message "fix: cálculo efectivo en cierre caja"
```

⚠ El OTA solo llega a APKs con el mismo `runtimeVersion` (basado en `version`). Si subiste la versión del APK, los APKs viejos NO recibirán el OTA.

### 5.10 Errores comunes al generar el APK

| Error | Causa | Solución |
|-------|-------|----------|
| `eas: not authenticated` | No hiciste `eas login` | `eas login` |
| Build falla en EAS por "Gradle error" | Conflicto de plugins Expo | Revisar `app.json plugins`, limpiar cache: `eas build --clear-cache` |
| APK instalado no conecta al backend | `apiHost` mal configurado | Re-editar `app.json` y rebuild |
| App crashea al abrir | OTA roto en runtime distinto | Desinstalar APK y reinstalar limpio |
| `cleartext communication not permitted` | `usesCleartextTraffic` no aplicado | Verificar plugin `./plugins/withAndroidCleartext` en `app.json` |
| Bluetooth no funciona | Permisos Android 12+ no concedidos | El usuario debe ir a Ajustes → App → Permisos → Bluetooth |

---

## 6. Instalar el servidor en el PC del cliente

### 6.1 Estructura final esperada

```
C:\LavaSuit\
  ├── backend\
  │     ├── prisma\
  │     │     ├── migrations\
  │     │     ├── schema.prisma
  │     │     └── seed.js
  │     ├── src\
  │     ├── public\
  │     ├── server.js
  │     ├── package.json
  │     ├── package-lock.json
  │     └── .env                      ← creado en sección 6.7
  ├── backups\                        ← creado en sección 8.2
  └── logs\                           ← creado en sección 7.4
```

### 6.2 Instalar Node.js 20 LTS

1. Descargar `node-v20.19.0-x64.msi` desde https://nodejs.org/dist/v20.19.0/
2. Ejecutar como administrador.
3. Wizard "Next" en todas las pantallas (instalar también `npm` y agregar al `PATH`).
4. Marcar la opción "Automatically install the necessary tools..." (para compilar módulos nativos como `better-sqlite3`).
5. Finalizar; el sub-instalador de Chocolatey puede tardar 5-10 minutos.

✅ Verificación:

```powershell
node --version    # debe mostrar v20.19.0 o superior
npm --version     # debe mostrar 10.x.x o superior
```

### 6.3 Instalar MySQL 8.0

1. Descargar `mysql-installer-community-8.0.X.X.msi` desde https://dev.mysql.com/downloads/installer/
2. Ejecutar como administrador.
3. Setup Type: **Server only**
4. En "Type and Networking":
   - Config Type: **Server Computer**
   - Connectivity: TCP/IP, Puerto **3306**, marcar "Open Windows Firewall"
5. En "Authentication Method": **Use Strong Password Encryption** (recomendado).
6. En "Accounts and Roles":
   - Definir password para `root` (anotar en gestor de contraseñas).
   - **No** crear usuarios adicionales aquí (lo haremos en sección 6.6).
7. En "Windows Service":
   - Service Name: **MySQL80**
   - **Marcar**: "Start the MySQL Server at System Startup"
   - Run as: **Standard System Account**
8. Aplicar configuración y finalizar.

✅ Verificación:

```powershell
Get-Service MySQL80
# Status debe ser "Running"
```

### 6.4 Crear estructura de carpetas

```powershell
New-Item -ItemType Directory -Path C:\LavaSuit
New-Item -ItemType Directory -Path C:\LavaSuit\backups
New-Item -ItemType Directory -Path C:\LavaSuit\logs
```

### 6.5 Copiar backend

Desde el USB (o repo Git), copiar la carpeta `backend\` a `C:\LavaSuit\backend\`.

❌ **NO copiar:**
- `node_modules\` (se reinstala en destino)
- `.env` (se crea único por cliente)
- `dev.db`, archivos `.sqlite` (si hubiera)

Después de copiar:

```powershell
cd C:\LavaSuit\backend
npm install
```

Tiempo estimado: 3-7 minutos según conexión.

### 6.6 Crear base de datos y usuario MySQL

Abrir **MySQL Command Line Client** (instalado con MySQL) o conectar vía:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

Introducir la password de root que definiste en 6.3.

Ejecutar (reemplazar `PASSWORD_FUERTE_UNICO` por una password generada para ESTE cliente):

```sql
CREATE DATABASE lavasuit_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'lavasuit_user'@'localhost'
  IDENTIFIED BY 'PASSWORD_FUERTE_UNICO';

GRANT ALL PRIVILEGES ON lavasuit_db.* TO 'lavasuit_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

⚠ **NO usar la password por defecto** `lavasuit_pass_2024` del `setup.sql` de desarrollo.

Generar password fuerte:

```powershell
node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"
```

✅ Verificación:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db
# Debe conectar con la password recién creada
EXIT;
```

### 6.7 Configurar `.env`

Crear `C:\LavaSuit\backend\.env` con el siguiente contenido (reemplazar valores):

```ini
# ─── Conexión a MySQL ───────────────────────────────────
DATABASE_URL="mysql://lavasuit_user:PASSWORD_FUERTE_UNICO@localhost:3306/lavasuit_db"

# ─── Secretos del backend ───────────────────────────────
# Generar único por cliente con:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET="REEMPLAZAR_POR_HEX_DE_96_CARACTERES"
JWT_EXPIRES_IN="7d"

# ─── Servidor HTTP ──────────────────────────────────────
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# ─── CORS (en prod, restringir si se conoce el origen) ──
CORS_ORIGIN=*

# ─── Licencias Supabase (mismo valor en todos los clientes) ─
SUPABASE_URL=https://awutehzbhhklcgodmluq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=REEMPLAZAR_POR_SERVICE_ROLE_KEY_REAL
LAVASUIT_PRODUCT_TYPE=LAUNDRY
LICENSE_GRACE_DAYS=7
```

✅ Verificar permisos del archivo:

```powershell
icacls C:\LavaSuit\backend\.env
```

Si está accesible por usuarios estándar, restringir:

```powershell
icacls C:\LavaSuit\backend\.env /inheritance:r /grant:r "SYSTEM:R" /grant:r "Administradores:F"
```

### 6.8 Generar Prisma client, aplicar schema, seed

```powershell
cd C:\LavaSuit\backend
npx prisma@5.22.0 generate
npx prisma@5.22.0 db push
node prisma/seed.js
```

⚠ Usar siempre `prisma@5.22.0` (no `npx prisma` a secas) porque `package.json` tiene Prisma 7 en devDeps pero `@prisma/client@5.22.0` en runtime.

✅ Verificación tras `db push`:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db -e "SHOW TABLES;"
# Debe listar las tablas: Cliente, Pedido, Pago, Servicio, etc.
```

✅ Verificación tras `seed.js`:

```powershell
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db -e "SELECT id, email, rol FROM Usuario;"
# Debe mostrar al menos un usuario ADMIN
```

### 6.9 Asignar IP fija LAN al servidor

#### Vía interfaz gráfica

1. `Configuración → Red e Internet → WiFi` (o Ethernet) → propiedades del adaptador conectado.
2. `Asignación IP → Editar → Manual → IPv4 activado`.
3. Configurar:
   - **Dirección IP**: `192.168.1.10` (ejemplo, debe estar fuera del rango DHCP del router)
   - **Máscara de subred**: `255.255.255.0`
   - **Puerta de enlace**: la IP del router (ej. `192.168.1.1`)
   - **DNS preferido**: `8.8.8.8`
   - **DNS alternativo**: `1.1.1.1`
4. Guardar.

#### Vía PowerShell (administrador)

```powershell
# Identificar el alias del adaptador
Get-NetAdapter

# Configurar IP fija (reemplazar "Wi-Fi" por el alias real)
New-NetIPAddress -InterfaceAlias "Wi-Fi" -IPAddress 192.168.1.10 -PrefixLength 24 -DefaultGateway 192.168.1.1
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ServerAddresses 8.8.8.8,1.1.1.1
```

✅ Verificación:

```powershell
ipconfig | findstr IPv4
# Debe mostrar 192.168.1.10
```

⚠ **Importante:** asegurarse que el router NO entregue esa IP por DHCP. Reservarla en el panel del router o sacarla del rango DHCP.

### 6.10 Abrir puerto 3000 en firewall Windows

PowerShell como administrador:

```powershell
New-NetFirewallRule `
  -DisplayName "LavaSuit Backend 3000" `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 3000 `
  -Action Allow `
  -Profile Private,Domain
```

⚠ Excluir el perfil `Public` salvo que el cliente lo requiera explícitamente.

✅ Verificación:

```powershell
Get-NetFirewallRule -DisplayName "LavaSuit Backend 3000"
```

### 6.11 Arranque inicial del backend (modo manual, para pruebas)

```powershell
cd C:\LavaSuit\backend
npm run dev
```

Salida esperada (resumen):

```
LavaSuit Backend en puerto 3000
Escuchando en:  http://0.0.0.0:3000  (accesible desde la red local)
IP LAN sugerida: http://192.168.1.10:3000/discovery
InstanceId:      xxxx-xxxx-xxxx
Base de datos:   MySQL
CORS origin:     *
```

### 6.12 Probar `/health`

Desde el mismo PC servidor:

```powershell
curl http://localhost:3000/health
```

Desde otro PC o celular en la misma red:

```powershell
curl http://192.168.1.10:3000/health
```

Respuesta esperada: HTTP `200`.

Si falla:

| Causa | Solución |
|-------|----------|
| Backend caído | Ver logs en consola |
| Firewall bloquea | Revisar regla (sección 6.10) |
| `HOST=127.0.0.1` en `.env` | Cambiar a `0.0.0.0` |
| Antivirus bloquea Node | Agregar excepción para `node.exe` |
| IP del servidor cambió | Verificar `ipconfig` |
| Dispositivo en otra red | Confirmar mismo SSID WiFi |

### 6.13 Detener el backend manual

`Ctrl + C` en la consola donde corre. Continuar con sección 7 para dejarlo como servicio.

---

## 7. Backend como servicio de Windows (PM2)

### 7.1 Por qué PM2

- Reinicia el backend automáticamente si crashea
- Arranca al encender el PC (antes del login)
- Mantiene logs rotados
- Permite recargar sin downtime
- Monitoreo de RAM/CPU

### 7.2 Instalar PM2 y pm2-windows-startup

PowerShell **como administrador**:

```powershell
npm install -g pm2 pm2-windows-startup
```

✅ Verificación:

```powershell
pm2 --version
```

### 7.3 Levantar el backend bajo PM2

```powershell
cd C:\LavaSuit\backend
pm2 start server.js --name lavasuit-backend --time --log-date-format "YYYY-MM-DD HH:mm:ss"
pm2 save
```

### 7.4 Registrar como servicio Windows (arranque automático)

PowerShell como administrador:

```powershell
pm2-startup install
```

✅ Verificación:

```powershell
Get-Service PM2
# Status: Running
```

Reiniciar el PC y verificar que `pm2 status` muestra el backend corriendo SIN haber iniciado sesión.

### 7.5 Configurar rotación de logs

```powershell
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
```

Ubicación de logs: `C:\Users\<USUARIO>\.pm2\logs\`

### 7.6 Comandos de operación diaria

```powershell
pm2 status                              # estado de todos los procesos
pm2 logs lavasuit-backend               # logs en vivo
pm2 logs lavasuit-backend --lines 200   # últimas 200 líneas
pm2 logs lavasuit-backend --err         # solo errores
pm2 restart lavasuit-backend            # reiniciar
pm2 stop lavasuit-backend               # detener
pm2 delete lavasuit-backend             # quitar del PM2
pm2 monit                               # monitor RAM/CPU en vivo
pm2 describe lavasuit-backend           # detalle del proceso
pm2 reload lavasuit-backend             # reinicio sin downtime
```

### 7.7 Aplicar actualizaciones del backend en producción

```powershell
# 1) Backup obligatorio de la base
& "C:\LavaSuit\backups\backup.bat"

# 2) Detener el proceso
pm2 stop lavasuit-backend

# 3) Copiar archivos nuevos (sin sobrescribir .env)
#    - reemplazar carpeta src\
#    - reemplazar prisma\schema.prisma si cambió
#    - reemplazar package.json si cambió

# 4) Si cambió package.json:
cd C:\LavaSuit\backend
npm install

# 5) Si cambió el schema:
npx prisma@5.22.0 generate
npx prisma@5.22.0 db push

# 6) Reiniciar
pm2 restart lavasuit-backend

# 7) Validar logs
pm2 logs lavasuit-backend --lines 50
```

### 7.8 Alternativa: NSSM (si PM2 falla con `pm2-startup`)

Descargar NSSM desde https://nssm.cc/ y copiar `nssm.exe` a `C:\Windows\System32\`.

```powershell
nssm install LavaSuitBackend
```

Se abre UI. Configurar:
- **Application Path:** `C:\Program Files\nodejs\node.exe`
- **Startup directory:** `C:\LavaSuit\backend`
- **Arguments:** `server.js`
- **I/O Tab:** redirigir stdout a `C:\LavaSuit\logs\stdout.log`, stderr a `C:\LavaSuit\logs\stderr.log`

```powershell
nssm start LavaSuitBackend
Get-Service LavaSuitBackend
```

### 7.9 Errores comunes PM2

| Error | Causa | Solución |
|-------|-------|----------|
| `pm2: command not found` | PM2 no instalado globalmente | `npm install -g pm2` |
| Backend no arranca tras reboot | Falta `pm2 save` antes de `pm2-startup install` | Re-ejecutar ambos comandos como admin |
| `pm2-startup install` falla | Sin permisos de admin | Abrir PowerShell como administrador |
| Logs ocupan mucho espacio | No se configuró logrotate | Sección 7.5 |
| Backend crashea cada 5 segundos | Error en `.env` o MySQL | `pm2 logs lavasuit-backend --err` |
| Proceso aparece "errored" | Faltan dependencias | `cd backend && npm install` |

---

## 8. MySQL en producción

### 8.1 Configuración recomendada `my.ini`

Ubicación típica: `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini`

Ajustes recomendados (en sección `[mysqld]`):

```ini
[mysqld]
# Charset
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci

# Conexiones
max_connections=150
max_allowed_packet=64M

# Performance
innodb_buffer_pool_size=2G       # 25-50% de la RAM disponible
innodb_log_file_size=256M
innodb_flush_log_at_trx_commit=1  # ACID estricto
innodb_flush_method=normal

# Logs
slow_query_log=1
slow_query_log_file=C:/ProgramData/MySQL/MySQL Server 8.0/Data/slow-query.log
long_query_time=2

# Timezone (Colombia)
default_time_zone='-05:00'
```

Reiniciar el servicio tras editar:

```powershell
Restart-Service MySQL80
```

### 8.2 Script de backup automático diario

Crear `C:\LavaSuit\backups\backup.bat`:

```bat
@echo off
setlocal

set MYSQL_DUMP="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
set DB_USER=lavasuit_user
set DB_PASS=PASSWORD_FUERTE_UNICO
set DB_NAME=lavasuit_db
set BACKUP_DIR=C:\LavaSuit\backups

REM Timestamp YYYYMMDD_HHmm
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set FECHA=%DT:~0,8%_%DT:~8,4%

set ARCHIVO=%BACKUP_DIR%\lavasuit_%FECHA%.sql

%MYSQL_DUMP% -u %DB_USER% -p%DB_PASS% ^
  --single-transaction --routines --triggers --events ^
  --default-character-set=utf8mb4 ^
  %DB_NAME% > "%ARCHIVO%"

if %ERRORLEVEL% NEQ 0 (
  echo [%date% %time%] ERROR: backup falló >> %BACKUP_DIR%\backup.log
  exit /b 1
)

REM Comprimir
powershell -Command "Compress-Archive -Path '%ARCHIVO%' -DestinationPath '%ARCHIVO%.zip' -Force"
del "%ARCHIVO%"

REM Eliminar backups mayores a 30 días
forfiles /p "%BACKUP_DIR%" /s /m *.zip /d -30 /c "cmd /c del @path" 2>nul

echo [%date% %time%] OK: %ARCHIVO%.zip >> %BACKUP_DIR%\backup.log
endlocal
```

### 8.3 Programar el backup en Task Scheduler

```powershell
$action = New-ScheduledTaskAction -Execute "C:\LavaSuit\backups\backup.bat"
$trigger = New-ScheduledTaskTrigger -Daily -At 3am
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName "LavaSuit Backup Diario" `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Backup completo de lavasuit_db a las 3:00 AM"
```

✅ Verificación:

```powershell
Get-ScheduledTask -TaskName "LavaSuit Backup Diario"
```

### 8.4 Backup manual antes de cambios críticos

```powershell
& "C:\LavaSuit\backups\backup.bat"
```

Verificar el archivo generado:

```powershell
Get-ChildItem C:\LavaSuit\backups\*.zip | Sort-Object LastWriteTime -Descending | Select-Object -First 1
```

### 8.5 Restaurar un backup

```powershell
# 1) Descomprimir el zip
Expand-Archive -Path C:\LavaSuit\backups\lavasuit_20260518_0300.sql.zip -DestinationPath C:\LavaSuit\backups\restore\

# 2) Detener backend
pm2 stop lavasuit-backend

# 3) Restaurar
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db < C:\LavaSuit\backups\restore\lavasuit_20260518_0300.sql

# 4) Reiniciar backend
pm2 restart lavasuit-backend
```

### 8.6 Verificar integridad de un backup

```powershell
$archivo = "C:\LavaSuit\backups\lavasuit_20260518_0300.sql.zip"
Test-Path $archivo
(Get-Item $archivo).Length / 1MB
```

⚠ Un backup de <1 MB en una base productiva es señal de error.

### 8.7 Política de cambios de schema

| Cambio | Riesgo | Procedimiento |
|--------|--------|---------------|
| Agregar columna nullable | Bajo | `npx prisma@5.22.0 db push` directo |
| Agregar tabla nueva | Bajo | `npx prisma@5.22.0 db push` directo |
| Agregar índice | Medio (lock breve) | Hacer en horario no productivo |
| Renombrar columna | Alto | Migración manual: agregar nueva, copiar datos, eliminar vieja |
| Eliminar columna | Alto | Backup + confirmación + `db push --accept-data-loss` |
| Eliminar tabla | Crítico | Backup + acta firmada con cliente |

❌ **NUNCA ejecutar en producción:**
- `npx prisma migrate reset` (borra TODO)
- `DROP DATABASE lavasuit_db`
- `DELETE FROM` sin `WHERE`
- `TRUNCATE` sin backup previo

### 8.8 Errores comunes MySQL

| Error | Causa | Solución |
|-------|-------|----------|
| `Access denied for user 'lavasuit_user'` | Password mal en `.env` | Re-verificar en `.env`, reiniciar backend |
| `Unknown database 'lavasuit_db'` | Base no creada | Ejecutar sección 6.6 |
| `ER_NOT_SUPPORTED_AUTH_MODE` | Cliente MySQL viejo + auth nueva | Reinstalar MySQL eligiendo "Legacy auth" o actualizar driver |
| `Too many connections` | Backend abre y no cierra conexiones | Reiniciar backend, revisar `prisma.$disconnect` |
| `Specified key was too long` | Charset mal configurado | Asegurar `utf8mb4_unicode_ci` |
| Backup vacío | Permisos en `mysqldump` | Verificar que el usuario tiene `PROCESS, LOCK TABLES` |

---

## 9. Configurar el Desktop en el cliente

### 9.1 Instalar el `.exe`

1. Copiar `LavaSuit-Setup-X.Y.Z.exe` al PC del cliente.
2. Doble click → wizard NSIS.
3. Elegir ruta (default: `C:\Users\<usuario>\AppData\Local\Programs\LavaSuit\` o `C:\Program Files\LavaSuit\` si se eligió "perMachine").
4. Marcar "Crear acceso directo en escritorio" y "Crear entrada en menú inicio".
5. Finalizar instalación.

### 9.2 Primer arranque

1. Abrir LavaSuit desde el escritorio.
2. La aplicación inicia y muestra:
   - Pantalla de licencia (si no hay licencia activa), o
   - Pantalla de login (si ya hay licencia)

### 9.3 Activar licencia

1. En pantalla de licencia, ingresar el código entregado al cliente (generado en panel Supabase).
2. Click "Activar".
3. El desktop llama a `POST http://localhost:3000/api/licencias/activar` (si el backend está en el mismo PC) o `POST http://<IP_SERVIDOR>:3000/api/licencias/activar`.
4. El backend valida contra Supabase y guarda la activación.
5. ✅ Mensaje "Licencia activada correctamente".

### 9.4 Login del admin inicial

Usar las credenciales del usuario admin creado por `prisma/seed.js`:

- **Usuario:** admin (o el email definido en `seed.js`)
- **Password:** la del seed (cambiar en producción)

⚠ Cambiar la password del admin desde la app inmediatamente tras el primer login.

### 9.5 Configuración de conexión al backend (si desktop y backend en PCs distintos)

Por defecto el desktop apunta a `http://localhost:3000`. Si está en otro PC de la LAN, editar la configuración de conexión desde la app o desde:

```
%APPDATA%\LavaSuit\config.json
```

```json
{
  "apiHost": "192.168.1.10",
  "apiPort": 3000,
  "apiProtocol": "http"
}
```

Reiniciar la app.

### 9.6 Pruebas funcionales

| Módulo | Prueba |
|--------|--------|
| Clientes | Crear cliente "Cliente Prueba", editar, eliminar |
| Servicios | Crear servicio "Lavado Camisa $10000", marcar inactivo, reactivar |
| Pedidos | Crear pedido con 2 servicios, asignar cliente, ver detalle |
| Pagos | Registrar pago efectivo parcial, registrar pago QR final |
| Caja | Abrir caja con $50.000 base, cerrar caja, validar `efectivoEsperado` |
| Recibos | Imprimir recibo desde detalle de pedido |
| Empleados | Ver listado y métricas (solo ADMIN) |
| Garantías | Registrar garantía con foto |
| Updater | Click "Buscar actualización" → debe responder OK |

### 9.7 Verificar auto-updater

1. Abrir LavaSuit.
2. Buscar versión actual en panel lateral o "Acerca de".
3. Click "Buscar actualización".
4. Si hay versión nueva: descargar, instalar, reiniciar.
5. ✅ Validar que tras reinicio:
   - SQLite local (`%APPDATA%\LavaSuit\lavasuit.db`) sobrevivió
   - Sesión sigue activa
   - Datos no se perdieron

### 9.8 Errores comunes Desktop

| Error | Causa | Solución |
|-------|-------|----------|
| App no abre | Falta runtime Visual C++ | Instalar `vc_redist.x64.exe` |
| Pantalla blanca al abrir | Renderer crasheó | Revisar `%APPDATA%\LavaSuit\logs\` |
| "No se puede conectar al servidor" | Backend caído o IP errada | Verificar `pm2 status` y `apiHost` en config |
| Licencia falla activar | Sin internet o Supabase down | Reintentar con internet; revisar `.env` |
| Updater dice "404" | Release sin `latest.yml` o repo privado | Subir los 3 archivos al release |
| Recibo no imprime | Impresora no configurada en Windows | Configurar impresora default en Windows |

---

## 10. Configurar el móvil en el cliente

### 10.1 Instalar el APK

#### Vía explorador de archivos

1. Pasar `lavasuit-<cliente>.apk` al celular (USB, WhatsApp, link descarga).
2. Abrir Ajustes → Aplicaciones → Permisos especiales → Instalar apps desconocidas.
3. Para el explorador o app que abrirá el APK: activar "Permitir desde esta fuente".
4. Volver al explorador, tocar el APK.
5. Aceptar instalación.

#### Vía ADB (técnico, opcional)

```powershell
adb devices
adb install -r C:\Entregables\lavasuit-laesquina-v1.0.1.apk
```

### 10.2 Permisos Android al primer arranque

Al abrir la app, conceder estos permisos cuando se soliciten:

- **Cámara:** para fotos de garantía
- **Fotos / Medios:** para seleccionar fotos
- **Ubicación (precisa):** requerida por Android 12+ para Bluetooth
- **Bluetooth (Cercanos):** para impresora térmica
- **Notificaciones:** para alertas de sincronización

⚠ Si el usuario rechazó algún permiso, debe ir manualmente a:
`Ajustes → Aplicaciones → LavaSuit → Permisos`

### 10.3 Activar licencia

Mismo flujo que desktop (sección 9.3). El móvil llama al backend del servidor (no a Supabase directamente).

### 10.4 Conectar al WiFi del local

⚠ El celular DEBE estar conectado a la MISMA red WiFi que el PC servidor. Si están en redes distintas (WiFi 2.4GHz vs 5GHz separadas), no se verán.

### 10.5 Probar conexión backend

1. Abrir LavaSuit en el celular.
2. Login con el mismo admin (o crear usuario operario desde desktop primero).
3. Ir a la pantalla "Pedidos".
4. Debe cargar la lista (vacía o con datos).
5. ✅ Indicador "online" o icono de WiFi conectado debe estar visible.

Si falla "Network Error":

```
Verificar en orden:
1. Celular y servidor en mismo WiFi (SSID)
2. ipconfig del servidor coincide con apiHost del APK
3. Firewall del servidor permite puerto 3000
4. curl http://<IP>:3000/health desde el navegador del celular responde
```

### 10.6 Probar modo offline

1. Con conexión OK, cargar datos (ir a Pedidos, Clientes, Servicios — para llenar SQLite).
2. Activar **modo avión** en el celular.
3. Crear un pedido nuevo, registrar un pago, abrir caja.
4. ✅ El pedido aparece local con icono "pendiente sincronizar".
5. Desactivar modo avión.
6. Esperar 15-30 segundos.
7. ✅ El icono cambia a "sincronizado". El pedido aparece en el desktop.

### 10.7 Emparejar impresora Bluetooth

1. **Encender** la impresora térmica.
2. Ajustes Android → Bluetooth → Buscar dispositivos.
3. Aparecerá la impresora con su nombre (ej. `BlueTooth Printer`).
4. Tocar para emparejar. PIN típico: `0000` o `1234`.
5. ✅ La impresora aparece como "Emparejada".

### 10.8 Configurar impresora en LavaSuit

1. Abrir LavaSuit en el celular.
2. Menú → Configuración → Impresora.
3. Tocar "Buscar impresoras".
4. Seleccionar la impresora emparejada de la lista.
5. Click "Imprimir prueba".
6. ✅ La impresora debe emitir el ticket de prueba.

### 10.9 Imprimir un recibo real

1. Ir a Pedidos → seleccionar pedido → "Imprimir recibo".
2. Verificar que sale completo: encabezado, items, total, métodos de pago, pie.
3. Si sale cortado: ajustar ancho del papel en config (58mm vs 80mm).

### 10.10 Errores comunes Mobile

| Error | Causa | Solución |
|-------|-------|----------|
| "Network Error" | Backend inalcanzable | Sección 10.5 |
| "Cleartext HTTP not allowed" | Plugin cleartext no aplicado | Rebuild APK con `app.json plugins` correcto |
| App crashea al abrir | OTA roto en runtime distinto | Desinstalar y reinstalar APK |
| Impresora no encontrada | Permisos Android 12+ | Conceder Bluetooth y Ubicación manualmente |
| Pedido no sincroniza | Cola atascada | Configuración → "Reintentar sincronización" |
| Foto de garantía pesada | Sin compresión | Versión actual comprime; reportar bug si persiste |
| Login OK pero datos vacíos | Usuario sin permisos | Asignar rol correcto desde desktop |

---

## 11. Flujo de actualizaciones

### 11.1 Matriz de decisión

| ¿Qué cambió? | Acción | Tiempo |
|--------------|--------|--------|
| Texto, estilo, validación cliente (mobile) | OTA mobile | 5 min |
| Lógica negocio mobile (cálculos, sync) | OTA mobile | 5 min |
| Pantalla nueva mobile (sin nativo) | OTA mobile | 5 min |
| `apiHost`, permisos, plugin nativo mobile | Rebuild APK | 30 min |
| Cambio en código desktop (UI, lógica) | Release GitHub + auto-updater | 15 min |
| Cambio en backend (sin schema) | Copy + `pm2 restart` por cliente | 5 min/cliente |
| Cambio en schema MySQL | Backup + `db push` + reinicio | 15 min/cliente |
| Nueva tabla/módulo end-to-end | Backend + Desktop + Mobile | 1-2 días |

### 11.2 Actualizar Desktop

```powershell
cd C:\Users\USER\Desktop\lavasuit
# 1) Editar desktop/package.json -> "version": "1.0.X"
git add desktop/package.json
git commit -m "release desktop v1.0.X"
git push origin main

# 2) Tag y push
git tag desktop-v1.0.X
git push origin desktop-v1.0.X

# 3) Esperar workflow en GitHub Actions
# 4) Cliente abre app → "Buscar actualización" → instalar
```

### 11.3 Actualizar Mobile OTA

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm run update:preview -- --message "fix: descripción del cambio"
# Cliente abre app → OTA se descarga automáticamente al iniciar
```

### 11.4 Actualizar Mobile APK

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
# Editar app.json:
#   expo.version "1.0.X"
#   expo.android.versionCode +1
# Editar apiHost si cambió la IP del cliente
npm run build:apk
# Descargar APK desde link EAS, distribuir al cliente
```

### 11.5 Actualizar Backend en un cliente

```powershell
# En el PC servidor del cliente
& "C:\LavaSuit\backups\backup.bat"        # backup obligatorio
pm2 stop lavasuit-backend
# Copiar archivos nuevos a C:\LavaSuit\backend\ (sin tocar .env)
cd C:\LavaSuit\backend
npm install                                # solo si cambió package.json
npx prisma@5.22.0 generate                 # solo si cambió schema
npx prisma@5.22.0 db push                  # solo si cambió schema
pm2 restart lavasuit-backend
pm2 logs lavasuit-backend --lines 50
```

### 11.6 Rollback

#### Rollback Desktop

El instalador anterior está en GitHub Releases. El cliente:
1. Desinstala la versión nueva.
2. Descarga e instala la anterior desde el release viejo.
3. La base de datos local sobrevive (sección 4.6).

#### Rollback Mobile OTA

```powershell
cd mobile
# Listar updates del canal
eas update:list --channel preview
# Republicar una versión vieja como nueva
eas update:republish --group <ID_DEL_UPDATE_VIEJO>
```

#### Rollback Backend

```powershell
pm2 stop lavasuit-backend
# Restaurar carpeta backend\ desde backup
# Restaurar base de datos desde dump (sección 8.5)
pm2 restart lavasuit-backend
```

---

## 12. Checklist completo de entrega

### 12.1 Pre-entrega (en taller, antes de ir al cliente)

- [ ] Información del cliente recolectada (sección 3.1)
- [ ] Código de licencia generado en Supabase
- [ ] Password MySQL único generado y anotado
- [ ] `JWT_SECRET` único generado y anotado
- [ ] Password admin LavaSuit generado y anotado
- [ ] Instalador `LavaSuit-Setup-X.Y.Z.exe` validado en máquina virtual
- [ ] APK compilado con `apiHost` = IP que se asignará al servidor
- [ ] USB con instaladores Node.js, MySQL, backend, APK, exe
- [ ] Documentos: este manual, acta de entrega, plantilla credenciales
- [ ] Hardware de respaldo (cable Ethernet, adaptador USB-RJ45)

### 12.2 Día de instalación — PC servidor

- [ ] Windows actualizado y reiniciado
- [ ] Node.js 20 LTS instalado (`node --version` OK)
- [ ] MySQL 8.0 instalado (`Get-Service MySQL80` Running)
- [ ] Carpeta `C:\LavaSuit\` creada con subcarpetas
- [ ] Backend copiado a `C:\LavaSuit\backend\`
- [ ] `npm install` finalizado sin errores
- [ ] Base `lavasuit_db` creada
- [ ] Usuario `lavasuit_user` creado con password única
- [ ] Archivo `.env` creado con valores correctos
- [ ] `npx prisma@5.22.0 db push` ejecutado, schema sincronizado
- [ ] `node prisma/seed.js` ejecutado, usuario admin creado
- [ ] Backend levantado en modo `npm run dev`, `/health` responde OK
- [ ] PM2 instalado globalmente
- [ ] Backend bajo PM2 con `pm2 start ... && pm2 save`
- [ ] `pm2-startup install` ejecutado, sobrevive reinicio
- [ ] Logrotate configurado
- [ ] IP fija LAN asignada al adaptador de red
- [ ] Reserva DHCP configurada en el router
- [ ] Regla de firewall puerto 3000 creada (Private + Domain)
- [ ] `curl http://<IP>:3000/health` desde otro dispositivo responde OK
- [ ] Carpeta `C:\LavaSuit\backups\` creada
- [ ] Script `backup.bat` creado con credenciales reales
- [ ] Tarea programada "LavaSuit Backup Diario" registrada a las 3 AM
- [ ] Primer backup manual ejecutado y verificado

### 12.3 Día de instalación — Desktop

- [ ] Visual C++ Redistributable instalado
- [ ] `LavaSuit-Setup-X.Y.Z.exe` ejecutado e instalado
- [ ] Atajo en escritorio funciona
- [ ] Licencia activada (mensaje OK)
- [ ] Login admin OK con password única
- [ ] Password admin cambiada desde la app
- [ ] Cliente prueba creado, editado y eliminado OK
- [ ] Servicio prueba creado OK
- [ ] Pedido prueba creado OK
- [ ] Pago prueba registrado OK
- [ ] Caja abierta, cerrada, `efectivoEsperado` cuadra
- [ ] Recibo prueba impreso desde desktop
- [ ] Updater: "Buscar actualización" responde "estás al día"

### 12.4 Día de instalación — Móviles

Por cada celular:

- [ ] APK instalado correctamente
- [ ] Permisos Android concedidos (Cámara, Ubicación, Bluetooth, Notificaciones, Fotos)
- [ ] Conectado al WiFi del local
- [ ] Licencia activada
- [ ] Login OK
- [ ] Pedidos cargan online
- [ ] Pedido creado en modo avión → sincroniza al volver red
- [ ] Impresora Bluetooth emparejada
- [ ] Impresión de recibo de prueba OK
- [ ] Modo offline validado completo

### 12.5 Capacitación al cliente

- [ ] Crear/editar/eliminar cliente
- [ ] Crear/editar servicio
- [ ] Crear pedido completo (cliente + servicios + notas)
- [ ] Cambiar estado de pedido
- [ ] Registrar pago (efectivo, QR, mixto)
- [ ] Entregar pedido con foto
- [ ] Abrir y cerrar caja
- [ ] Imprimir recibo
- [ ] Crear garantía
- [ ] Importar clientes desde Excel
- [ ] Ver listado de empleados (solo admin)
- [ ] Buscar pedidos por cliente o fecha
- [ ] Sincronización mobile/desktop en tiempo real
- [ ] Qué hacer si se va el internet
- [ ] Qué hacer si se apaga el PC servidor

### 12.6 Documentos firmados / entregados

- [ ] Acta de entrega firmada (Anexo D)
- [ ] Plantilla de credenciales entregada en sobre cerrado (Anexo E)
- [ ] Datos de contacto soporte entregados
- [ ] Manual de usuario corto entregado (separado de este manual técnico)
- [ ] Recordatorio de revisar backups semanalmente

---

## 13. Troubleshooting completo

### 13.1 Backend

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| Backend no arranca | `pm2 logs lavasuit-backend --err` | Ver mensaje específico |
| `FATAL: JWT_SECRET no está definido` | `.env` ausente o sin variable | Crear `.env` correcto (sección 6.7) |
| `P1001: Can't reach database server` | MySQL caído o credenciales mal | `Get-Service MySQL80`; verificar `DATABASE_URL` |
| `P1010: User was denied access` | Permisos faltantes | `GRANT ALL PRIVILEGES` re-ejecutar |
| `EADDRINUSE: address already in use :::3000` | Otro proceso en 3000 | `netstat -ano | findstr :3000`; terminar PID conflictivo |
| Backend responde 500 a todo | Schema desincronizado | `npx prisma@5.22.0 db push` |
| Memory leak / RAM creciente | Sin `prisma.$disconnect` o suscripción no liberada | Reiniciar `pm2 restart`; revisar código |
| Logs llenan disco | `pm2-logrotate` no configurado | Sección 7.5 |

### 13.2 MySQL

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| Servicio no inicia | Visor de eventos Windows | Revisar `data/<hostname>.err` |
| `Access denied root` | Password olvidada | Reset siguiendo docs MySQL |
| Backup vacío | Usuario sin permisos | Verificar `PROCESS, LOCK TABLES` |
| Restore falla | Charset incompatible | Especificar `--default-character-set=utf8mb4` |
| Disco lleno por binlogs | Logs de replicación crecen | Deshabilitar binlog si no se usa replicación |

### 13.3 Desktop

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| App no abre | Falta runtime | Instalar VC++ Redistributable x64 |
| Pantalla blanca | DevTools en logs | Reinstalar con admin |
| "No se puede conectar" | Backend caído / IP errada | Verificar config |
| Updater 404 | Release incompleto | Subir `.exe + latest.yml + .blockmap` |
| Recibo no imprime | Impresora no configurada en Windows | Configurar impresora default |
| App lenta tras updates | Cache no limpiado | Borrar `%APPDATA%\LavaSuit\Cache\` |

### 13.4 Mobile

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| "Network Error" | Backend inalcanzable | Mismo WiFi, firewall, IP correcta |
| Cleartext HTTP | Plugin no aplicado | Rebuild con `withAndroidCleartext` |
| Crash al abrir | OTA roto | Desinstalar y reinstalar APK |
| Bluetooth no aparece | Permisos | Ajustes → permisos manualmente |
| Sync atascada | Cola con error persistente | Botón "Reintentar" en config |
| Datos no aparecen tras login | Usuario sin rol | Asignar rol desde desktop |
| Foto no sube | Sin permiso de cámara | Permisos manualmente |

### 13.5 Red / Conectividad

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| Móvil no ve al servidor | `ping <IP>` desde celular | Mismo SSID, mismo segmento de red |
| `curl /health` desde mobile falla | Firewall | Sección 6.10 |
| Funciona localhost pero no IP | `HOST=127.0.0.1` | Cambiar a `0.0.0.0` |
| Cliente reporta cortes intermitentes | Calidad WiFi | Cambiar canal del router, agregar AP |
| IP del servidor cambió | DHCP entregó otra IP | Asegurar IP fija (sección 6.9) |

### 13.6 Licencias

| Síntoma | Diagnóstico | Solución |
|---------|-------------|----------|
| "Sistema de licencias no configurado" | Falta `SUPABASE_*` en `.env` | Agregar variables, reiniciar backend |
| "Licencia inválida" | Código mal escrito o ya usado | Verificar en panel Supabase |
| "Licencia expirada" | Pasó el periodo | Renovar en Supabase |
| Offline > `LICENSE_GRACE_DAYS` | Demasiado tiempo sin internet | Conectar al menos una vez en ese plazo |

---

## 14. Soporte post-venta

### 14.1 Canales de soporte recomendados

| Canal | Cuándo usarlo | Tiempo de respuesta |
|-------|---------------|---------------------|
| Email | Reportes no urgentes, consultas | 24h hábiles |
| WhatsApp | Urgencias, sistema caído | 1-4h |
| AnyDesk | Diagnóstico remoto | Sesión coordinada |
| Llamada | Capacitación adicional | Cita previa |

### 14.2 SLA propuesto

| Severidad | Definición | Tiempo respuesta | Tiempo resolución |
|-----------|------------|------------------|-------------------|
| **Crítica** | Sistema caído, no se puede facturar | 1 hora | 4 horas |
| **Alta** | Funcionalidad principal no disponible | 4 horas | 1 día hábil |
| **Media** | Bug en módulo secundario | 1 día hábil | 1 semana |
| **Baja** | Mejora, consulta | 3 días hábiles | A acordar |

### 14.3 Acceso remoto

Instalar en PC servidor del cliente (con consentimiento):

- **AnyDesk** o **TeamViewer** (uso comercial requiere licencia paga)
- Anotar el ID del cliente
- Pedir que el cliente apruebe cada sesión

### 14.4 Monitoreo proactivo (opcional, avanzado)

- Script en `node-cron` que cada hora hace `GET /health` y avisa por email si falla
- Backup centralizado a OneDrive/Drive del cliente cada noche
- Notificación si el backup diario no se ejecutó (verificar `backup.log`)

### 14.5 Renovación anual

- Revisar versión de Node.js, MySQL, Windows
- Verificar logs de PM2 y backups
- Confirmar que `LICENSE_GRACE_DAYS` es razonable
- Actualizar APK con últimas mejoras
- Capacitar a nuevo personal si rotación

---

## Anexo A — Plantilla `.env`

```ini
# ─── LavaSuit Backend Configuration ─────────────────────
# Archivo: C:\LavaSuit\backend\.env
# Cliente: __________________________________
# Fecha de instalación: ___________________
# Instalador técnico: _____________________

# ─── Conexión MySQL ─────────────────────────────────────
DATABASE_URL="mysql://lavasuit_user:GENERAR_PASSWORD@localhost:3306/lavasuit_db"

# ─── JWT ────────────────────────────────────────────────
# Generar con:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET="GENERAR_HEX_96_CHARS"
JWT_EXPIRES_IN="7d"

# ─── HTTP Server ────────────────────────────────────────
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=*

# ─── Supabase Licencias ─────────────────────────────────
SUPABASE_URL=https://awutehzbhhklcgodmluq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=PEGAR_SERVICE_ROLE_KEY
LAVASUIT_PRODUCT_TYPE=LAUNDRY
LICENSE_GRACE_DAYS=7

# ─── Opcional ──────────────────────────────────────────
# DISCOVERY_DISABLED=1   # desactivar mDNS si causa ruido en la red
# REDIS_URL=redis://localhost:6379   # no se usa actualmente
```

---

## Anexo B — Plantilla `setup.sql`

```sql
-- ──────────────────────────────────────────────────────
-- LavaSuit — Setup inicial de base de datos
-- Cliente: _______________________________
-- Fecha:   _______________________________
-- ──────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS lavasuit_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- ⚠ Reemplazar PASSWORD_FUERTE por una password única
CREATE USER IF NOT EXISTS 'lavasuit_user'@'localhost'
  IDENTIFIED BY 'PASSWORD_FUERTE';

GRANT ALL PRIVILEGES ON lavasuit_db.* TO 'lavasuit_user'@'localhost';

FLUSH PRIVILEGES;

-- Verificación
SHOW DATABASES LIKE 'lavasuit_db';
SELECT User, Host FROM mysql.user WHERE User = 'lavasuit_user';
```

---

## Anexo C — Plantilla `backup.bat`

```bat
@echo off
REM ────────────────────────────────────────────────
REM LavaSuit — Backup diario MySQL
REM Ubicación: C:\LavaSuit\backups\backup.bat
REM ────────────────────────────────────────────────
setlocal

set MYSQL_DUMP="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
set DB_USER=lavasuit_user
set DB_PASS=REEMPLAZAR_PASSWORD
set DB_NAME=lavasuit_db
set BACKUP_DIR=C:\LavaSuit\backups

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set DT=%%I
set FECHA=%DT:~0,8%_%DT:~8,4%
set ARCHIVO=%BACKUP_DIR%\lavasuit_%FECHA%.sql

%MYSQL_DUMP% -u %DB_USER% -p%DB_PASS% ^
  --single-transaction --routines --triggers --events ^
  --default-character-set=utf8mb4 ^
  %DB_NAME% > "%ARCHIVO%"

if %ERRORLEVEL% NEQ 0 (
  echo [%date% %time%] ERROR: backup falló >> %BACKUP_DIR%\backup.log
  exit /b 1
)

powershell -Command "Compress-Archive -Path '%ARCHIVO%' -DestinationPath '%ARCHIVO%.zip' -Force"
del "%ARCHIVO%"

forfiles /p "%BACKUP_DIR%" /s /m *.zip /d -30 /c "cmd /c del @path" 2>nul

echo [%date% %time%] OK: %ARCHIVO%.zip >> %BACKUP_DIR%\backup.log
endlocal
```

---

## Anexo D — Plantilla acta de entrega

```
ACTA DE ENTREGA — SISTEMA LAVASUIT

Cliente:          ____________________________________
Razón social:     ____________________________________
NIT/RUT:          ____________________________________
Dirección:        ____________________________________
Teléfono:         ____________________________________
Email:            ____________________________________

Fecha entrega:    ____ / ____ / ________
Hora inicio:      _______
Hora finalización: _______
Instalador:       ____________________________________

COMPONENTES ENTREGADOS

[ ] Servidor backend instalado en PC _____________________
    IP fija LAN: 192.168.____.____
    Sistema: Windows _____________
    
[ ] Aplicación Desktop instalada en ____ equipo(s)
    Versión: ____________
    
[ ] Aplicación Mobile instalada en ____ celular(es)
    Versión APK: ____________
    
[ ] Impresora Bluetooth configurada
    Marca/modelo: ____________________
    Cantidad: ______

[ ] Sistema de licencia activado
    Código: ____________________
    Vigencia hasta: ____ / ____ / ________

[ ] Backups automáticos programados a las 3:00 AM
    Carpeta: C:\LavaSuit\backups\
    Retención: 30 días

[ ] Capacitación al personal realizada
    Personas capacitadas: ______
    Duración: ______ horas

OBSERVACIONES
_______________________________________________________
_______________________________________________________
_______________________________________________________

DECLARACIÓN DEL CLIENTE
Recibo conforme el sistema LavaSuit instalado y validado
en funcionamiento. He recibido capacitación sobre el uso
y las credenciales en sobre cerrado.

Cliente:                       Instalador:

___________________            ___________________
Firma                          Firma
Nombre: __________             Nombre: __________
C.C.: ____________             C.C.: ____________
```

---

## Anexo E — Plantilla credenciales

```
╔════════════════════════════════════════════════════════╗
║         LAVASUIT — CREDENCIALES DEL SISTEMA            ║
║              CONFIDENCIAL — NO COMPARTIR               ║
╠════════════════════════════════════════════════════════╣
║                                                        ║
║  Cliente:        _________________________________     ║
║  Fecha entrega:  ____ / ____ / ________                ║
║                                                        ║
║  ─── ACCESO LAVASUIT ─────────────────────────         ║
║  URL servidor:   http://192.168.____.____:3000          ║
║  Usuario admin:  _________________________________     ║
║  Password:       _________________________________     ║
║                                                        ║
║  ─── ACCESO MYSQL (técnico) ──────────────────         ║
║  Host:           localhost:3306                        ║
║  Base:           lavasuit_db                           ║
║  Usuario:        lavasuit_user                         ║
║  Password:       _________________________________     ║
║                                                        ║
║  ─── ACCESO WINDOWS (PC servidor) ────────────         ║
║  Usuario:        _________________________________     ║
║  Password:       _________________________________     ║
║                                                        ║
║  ─── LICENCIA ────────────────────────────────         ║
║  Código:         _________________________________     ║
║  Vence:          ____ / ____ / ________                ║
║                                                        ║
║  ─── SOPORTE ─────────────────────────────────         ║
║  Email:          _________________________________     ║
║  WhatsApp:       _________________________________     ║
║                                                        ║
╚════════════════════════════════════════════════════════╝

CAMBIAR LA PASSWORD ADMIN DE LAVASUIT EN EL PRIMER LOGIN
GUARDAR ESTE SOBRE EN CAJA FUERTE
```

---

## Anexo F — Diagrama de red

```
                    ┌──────────────────────┐
                    │   ROUTER WIFI        │
                    │   192.168.1.1        │
                    │   DHCP: 100-199      │
                    └─────────┬────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        │ Ethernet/WiFi       │ WiFi 2.4/5 GHz      │ WiFi
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│ PC SERVIDOR   │    │ PC ADMIN       │    │ CELULAR        │
│ 192.168.1.10  │    │ 192.168.1.11   │    │ 192.168.1.150  │
│ (IP fija)     │    │ (DHCP)         │    │ (DHCP)         │
│               │    │                │    │                │
│ MySQL 3306    │    │ LavaSuit       │    │ LavaSuit       │
│ Backend 3000  │◀───│ Desktop        │    │ Mobile         │
│ PM2 service   │    │                │    │                │
└───────────────┘    └────────────────┘    └──────┬─────────┘
        ▲                                          │
        │                                          │ Bluetooth
        │                                          ▼
        │                                  ┌────────────────┐
        │                                  │ IMPRESORA      │
        │                                  │ TÉRMICA 58mm   │
        │ HTTPS                            └────────────────┘
        ▼
┌───────────────┐
│   SUPABASE    │
│ (licencias)   │
└───────────────┘
```

Reservar en panel del router la IP `192.168.1.10` para la MAC del PC servidor para impedir conflictos DHCP.

---

## Anexo G — Comandos de referencia rápida

### Backend / PM2

```powershell
# Estado
pm2 status
pm2 describe lavasuit-backend

# Logs
pm2 logs lavasuit-backend
pm2 logs lavasuit-backend --lines 200 --err

# Control
pm2 restart lavasuit-backend
pm2 reload lavasuit-backend    # sin downtime
pm2 stop lavasuit-backend
pm2 delete lavasuit-backend

# Monitor
pm2 monit

# Persistencia
pm2 save
pm2-startup install
pm2 unstartup
```

### Prisma

```powershell
cd C:\LavaSuit\backend
npx prisma@5.22.0 generate
npx prisma@5.22.0 db push
npx prisma@5.22.0 db push --accept-data-loss   # solo con backup previo
npx prisma@5.22.0 studio                       # UI web en :5555
npx prisma@5.22.0 validate
```

### MySQL

```powershell
# Conectar
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db

# Backup manual
& "C:\LavaSuit\backups\backup.bat"

# Restaurar
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u lavasuit_user -p lavasuit_db < backup.sql

# Servicio
Get-Service MySQL80
Restart-Service MySQL80
```

### Red

```powershell
# IP propia
ipconfig | findstr IPv4

# Test puerto desde otro PC
Test-NetConnection -ComputerName 192.168.1.10 -Port 3000

# Reglas de firewall
Get-NetFirewallRule -DisplayName "LavaSuit*"
Remove-NetFirewallRule -DisplayName "LavaSuit Backend 3000"
```

### Build Desktop

```powershell
cd C:\Users\USER\Desktop\lavasuit\desktop
npm run typecheck
npm run build:installer       # local sin publicar
npm run build:publish         # publicar a GitHub Releases
```

### Build Mobile

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
npm run typecheck
npm run build:apk             # APK preview
npm run build:aab             # AAB producción
npm run update:preview -- --message "..."   # OTA
```

### Git release tags

```powershell
git tag desktop-v1.0.1
git push origin desktop-v1.0.1
git tag -d desktop-v1.0.1                    # eliminar local
git push origin :refs/tags/desktop-v1.0.1    # eliminar remoto
```

---

## Anexo H — Estructura de archivos

### Repositorio fuente

```
C:\Users\USER\Desktop\lavasuit\
  ├── .github\
  │     └── workflows\
  │           └── desktop-release.yml
  ├── backend\
  │     ├── prisma\
  │     │     ├── migrations\
  │     │     ├── schema.prisma
  │     │     ├── seed.js
  │     │     └── seed-empleado-prueba.js
  │     ├── public\
  │     ├── src\
  │     │     ├── app.js
  │     │     ├── lib\
  │     │     ├── middlewares\
  │     │     ├── routes\
  │     │     ├── sockets\
  │     │     └── ...
  │     ├── tests\
  │     ├── server.js
  │     ├── package.json
  │     ├── .env (ignorado por git)
  │     └── .env.example
  ├── database\
  │     ├── setup.sql
  │     ├── migrations\
  │     └── seeds\
  ├── desktop\
  │     ├── dist\
  │     │     ├── electron\          ← instaladores generados
  │     │     └── renderer\          ← bundle Vite
  │     ├── electron\
  │     │     ├── main.js
  │     │     ├── preload.js
  │     │     └── updater.js
  │     ├── src\                     ← React + TypeScript
  │     ├── index.html
  │     ├── package.json
  │     ├── tsconfig.json
  │     └── vite.config.ts
  ├── docs\
  │     ├── INSTALLATION_GUIDE.md     ← este manual
  │     ├── INSTALLATION_GUIDE.pdf    ← PDF entregable
  │     ├── CLIENT_DELIVERY_CHECKLIST.md
  │     ├── LEGACY_README.md
  │     ├── UPDATES.md
  │     └── build-pdf.ps1
  ├── mobile\
  │     ├── android\                 ← prebuild Android
  │     ├── assets\
  │     ├── plugins\
  │     │     └── withAndroidCleartext.js
  │     ├── src\                     ← React Native + TypeScript
  │     ├── app.json
  │     ├── eas.json
  │     ├── package.json
  │     └── index.ts
  ├── README.md                       ← corto, link al manual
  ├── iniciar-backend.bat
  ├── iniciar-desktop.bat
  └── iniciar-mobile.bat
```

### Instalación cliente

```
C:\LavaSuit\
  ├── backend\
  │     ├── node_modules\
  │     ├── prisma\
  │     ├── src\
  │     ├── server.js
  │     ├── package.json
  │     └── .env                      ← único por cliente
  ├── backups\
  │     ├── backup.bat
  │     ├── backup.log
  │     └── lavasuit_*.sql.zip
  └── logs\
        ├── stdout.log
        └── stderr.log
```

### Datos del usuario Windows

```
C:\Users\<usuario>\
  ├── AppData\
  │     └── Roaming\
  │           └── LavaSuit\
  │                 ├── lavasuit.db    ← SQLite cache del desktop
  │                 ├── config.json
  │                 └── logs\
  └── .pm2\
        ├── logs\
        ├── pids\
        └── dump.pm2
```

---

## Anexo I — Mejoras pendientes recomendadas

Estas mejoras NO bloquean la entrega, pero deberían planificarse para próximas versiones:

| Prioridad | Mejora | Impacto |
|-----------|--------|---------|
| **Alta** | Pantalla "Configurar servidor" en mobile (eliminar `apiHost` hardcodeado) | Permite reusar el mismo APK para todos los clientes |
| **Alta** | HTTPS local con certificado autofirmado | Eliminar `usesCleartextTraffic` y `CORS_ORIGIN=*` |
| **Alta** | Migraciones formales con `prisma migrate` en producción | Track history en `prisma/migrations`, evita `db push` riesgoso |
| **Media** | Healthcheck remoto con alerta por email/Telegram | Aviso proactivo si el backend cae |
| **Media** | Panel admin de licencias propio (no solo Supabase) | Independizarse del panel actual |
| **Media** | Tests E2E con Playwright (desktop) y Detox (mobile) | Reducir bugs post-release |
| **Media** | Compresión de imágenes en garantía (servidor) | Ahorro de espacio MySQL |
| **Baja** | Versión iOS de la app mobile | Solo si hay demanda |
| **Baja** | Modo multi-sucursal | Cliente con varias tintorerías |
| **Baja** | Reportes en PDF (no solo Excel) | Mejor presentación |
| **Baja** | Integración con WhatsApp Business para notificar entregas | Reduce llamadas |

---

**Fin del manual.**

Documento generado el 2026-05-18.
Para reportar erratas o sugerir mejoras: abrir issue en https://github.com/santiagomontanes/lavasuit-tintureria/issues
