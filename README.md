# LavaSuit

Sistema de gestión para lavandería con backend Node.js + MySQL, app móvil Android (Expo) y app de escritorio Windows (Electron). Funciona online y offline, se sincroniza automáticamente y refleja cambios en tiempo real entre dispositivos.

---

## Tabla de contenido

1. [Arquitectura](#1-arquitectura)
2. [Pre-requisitos](#2-pre-requisitos)
3. [Instalación del servidor (backend + MySQL)](#3-instalación-del-servidor)
4. [Rotar JWT_SECRET (obligatorio antes de producción)](#4-rotar-jwt_secret)
5. [Migraciones Prisma versionadas](#5-migraciones-prisma-versionadas)
6. [Compilar el instalador de la app de escritorio (.exe)](#6-compilar-el-instalador-de-la-app-de-escritorio)
7. [Compilar el APK de la app móvil](#7-compilar-el-apk-de-la-app-móvil)
8. [Configuración de red (IP del servidor)](#8-configuración-de-red)
9. [Operación diaria — flujo básico](#9-operación-diaria)
10. [Mantener el backend corriendo (PM2)](#10-mantener-el-backend-corriendo)
11. [Solución de problemas](#11-solución-de-problemas)
12. [Checklist final de entrega](#12-checklist-final-de-entrega)

---

## 1. Arquitectura

```
                ┌────────────────────────┐
                │   PC servidor (Win)    │
                │  ┌──────────────────┐  │
                │  │ Backend Node.js  │  │  ← puerto 3000
                │  │  + MySQL local   │  │
                │  └──────────────────┘  │
                └─────────┬──────────────┘
                          │   red local (WiFi/Ethernet)
              ┌───────────┼───────────┐
              ▼           ▼           ▼
       ┌──────────┐ ┌──────────┐ ┌──────────┐
       │ Desktop  │ │ Móvil 1  │ │ Móvil 2  │
       │ (Win)    │ │(Android) │ │(Android) │
       └──────────┘ └──────────┘ └──────────┘
       Admin/mostrador  Recolectores en campo
```

- **El backend corre en un PC** (puede ser el mismo donde se usa el desktop o uno aparte).
- **Móvil y desktop** se conectan por red local (WiFi) al puerto **3000** del PC servidor.
- **Móvil** funciona también sin internet: guarda en su memoria interna y sincroniza cuando vuelve la conexión.
- **Realtime**: si un móvil registra un pedido, el desktop lo ve aparecer al instante (Socket.io).

---

## 2. Pre-requisitos

### En el PC servidor
- **Windows 10 u 11**
- **MySQL 8.x** (instalar desde https://dev.mysql.com/downloads/installer/) — recordar el password de `root`.
- **Node.js 20 LTS o superior** (https://nodejs.org/)
- **Git** (opcional, solo si vas a actualizar desde repositorio)

### Para compilar la app móvil (una sola vez)
- Cuenta gratuita de **Expo**: https://expo.dev/signup
- En el PC: `npm install -g eas-cli`

### En el celular de cada operador
- Android 8 o superior
- Permitir "instalar apps de fuentes desconocidas" (Ajustes → Apps → Permisos especiales)

---

## 3. Instalación del servidor

### 3.1 Crear la base de datos en MySQL

Abrir CMD o PowerShell:

```powershell
mysql -u root -p
```

Una vez dentro de MySQL, pegar:

```sql
CREATE DATABASE IF NOT EXISTS lavasuit_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lavasuit_user'@'localhost' IDENTIFIED BY 'CAMBIAR_POR_PASSWORD_FUERTE';
GRANT ALL PRIVILEGES ON lavasuit_db.* TO 'lavasuit_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Cambia `CAMBIAR_POR_PASSWORD_FUERTE`** por una contraseña real. Anótala — la vas a usar en el `.env`.

### 3.2 Instalar dependencias del backend

```powershell
cd C:\Users\USER\Desktop\lavasuit\backend
npm install
```

### 3.3 Crear el archivo `.env`

Copiar `.env.example` a `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

Ajustar:

```ini
DATABASE_URL="mysql://lavasuit_user:TU_PASSWORD@localhost:3306/lavasuit_db"
JWT_SECRET="aún-no-rotado-ver-sección-4"
JWT_EXPIRES_IN="7d"
PORT=3000
NODE_ENV=production
CORS_ORIGIN="*"
```

### 3.4 Aplicar el schema y crear los datos iniciales

```powershell
npx prisma db push
npx prisma generate
node prisma/seed.js
```

Esto crea las tablas y los usuarios/servicios/clientes de prueba:
- **Admin**: `admin@lavasuit.com` / `admin123` ← cambiar después con `PUT /api/auth/password`
- **Empleado**: `empleado@lavasuit.com` / `empleado123`

### 3.5 Probar el backend

```powershell
npm run dev
```

Abrir `http://localhost:3000/health` en el navegador. Debe responder:
```json
{ "status": "ok", "db": "mysql", "timestamp": "..." }
```

Si funciona, parar con `Ctrl+C` y continuar a la sección 4.

---

## 4. Rotar JWT_SECRET

El `.env` actual tiene un secreto que estaba en el código fuente. **Antes de entregar al cliente** hay que reemplazarlo.

### 4.1 Generar un nuevo secreto

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Esto imprime una cadena de 96 caracteres. Copiarla.

### 4.2 Pegar en `backend/.env`

```ini
JWT_SECRET="la-cadena-de-96-caracteres-que-acabas-de-generar"
```

### 4.3 Impacto

- **Todos los tokens emitidos antes** dejan de ser válidos. Los usuarios que estaban logueados verán "Sesión expirada" en su próximo request y tendrán que ingresar credenciales de nuevo.
- No afecta a la base de datos, ni a clientes, pedidos ni pagos.
- Hay que reiniciar el backend para que tome el nuevo secreto.

---

## 5. Migraciones Prisma versionadas

Hasta ahora el schema se aplicó con `prisma db push` (rápido para desarrollo). Para producción conviene **migraciones versionadas**, que dejan registro de qué cambios se aplicaron y cuándo.

### 5.1 Crear la migración base (una sola vez)

Con el backend parado:

```powershell
cd C:\Users\USER\Desktop\lavasuit\backend
New-Item -ItemType Directory -Force prisma\migrations\0_init | Out-Null
npx prisma migrate diff --from-empty --to-schema-datamodel prisma\schema.prisma --script | Out-File -Encoding utf8 prisma\migrations\0_init\migration.sql
npx prisma migrate resolve --applied 0_init
```

Esto:
1. Crea la carpeta `prisma/migrations/0_init/` con el SQL que recrea todo el schema desde cero.
2. Le dice a Prisma "esta migración ya está aplicada" (porque la DB ya existe gracias al `db push` previo).

### 5.2 Para cambios futuros del schema

A partir de ahora, cuando edites `prisma/schema.prisma`:

```powershell
npx prisma migrate dev --name nombre-corto-del-cambio
```

Esto genera una nueva carpeta `prisma/migrations/<timestamp>_nombre-corto-del-cambio/` con el SQL del cambio. La carpeta `prisma/migrations/` debe versionarse en git.

### 5.3 En el servidor de producción

```powershell
npx prisma migrate deploy
```

Aplica todas las migraciones pendientes. Nunca usar `migrate dev` en producción (eso es solo para desarrollo).

---

## 6. Compilar el instalador de la app de escritorio

### 6.1 Configurar la URL del backend

Crear `desktop\.env`:

```powershell
cd C:\Users\USER\Desktop\lavasuit\desktop
Copy-Item .env.example .env
notepad .env
```

Editar `VITE_API_URL`:
- Si el `.exe` se instalará en el **mismo PC que corre el backend**: `http://localhost:3000`
- Si se instalará en otro PC de la red: `http://192.168.X.Y:3000` (la IP del servidor, ver sección 8)

### 6.2 Generar el instalador

```powershell
cd C:\Users\USER\Desktop\lavasuit\desktop
npm install
npm run build:installer
```

Esto tarda 2-5 minutos. Cuando termine, encontrarás:

```
desktop\dist\electron\LavaSuit-Setup-1.0.0.exe
```

### 6.3 Icono personalizado (opcional)

Si quieres un icono propio en el .exe:
1. Crear archivo `desktop\build\icon.ico` (256×256, formato ICO).
2. Volver a correr `npm run build:installer`.

Si no, electron-builder usa un icono genérico de Electron.

### 6.4 Instalar en una PC

1. Copiar `LavaSuit-Setup-1.0.0.exe` a la PC destino (USB, red, descarga, etc.).
2. Doble clic. Windows puede advertir "editor desconocido" — clic en "Más información" → "Ejecutar de todas formas".
3. Elegir carpeta de instalación. Crea acceso directo en escritorio y menú inicio.
4. Lanzar **LavaSuit** desde el menú inicio.

---

## 7. Compilar el APK de la app móvil

### 7.1 Configurar la IP del servidor en el código

Editar `mobile\app.json`:

```json
"extra": {
  "apiHost": "192.168.X.Y",   ← IP del PC servidor (ver sección 8)
  "apiPort": 3000,
  "apiProtocol": "http",
  "syncIntervalMs": 15000,
  "syncMaxRetries": 5
}
```

### 7.2 Instalar EAS CLI (una sola vez por PC)

```powershell
npm install -g eas-cli
eas login
```

Te pide tu cuenta de https://expo.dev. Si no tienes, crea una gratis.

### 7.3 Configurar el proyecto en EAS (una sola vez por proyecto)

```powershell
cd C:\Users\USER\Desktop\lavasuit\mobile
eas build:configure
```

Acepta los defaults. Esto añade un `projectId` a tu `app.json` (committeable).

### 7.4 Generar el APK

```powershell
npm run build:apk
```

EAS hace el build en su nube (gratis, hasta 30 builds/mes en plan free). Tarda 10-20 minutos. Al terminar te da una URL de descarga del APK.

### 7.5 Instalar en cada Android

1. Descargar el APK al celular (vía email, WhatsApp, USB, o el QR que da EAS).
2. Abrir el archivo `.apk` desde el explorador de archivos del celular.
3. Aceptar el aviso "instalar de fuente desconocida" (solo aparece la primera vez).
4. Una vez instalado, abrir **LavaSuit**.
5. Login: `admin@lavasuit.com` / `admin123` (o el usuario que creaste).

### 7.6 Para cambiar la IP del servidor sin recompilar

Si el servidor cambia de IP, tienes que volver a editar `app.json` y correr `npm run build:apk` de nuevo, luego reinstalar el APK. Para entornos donde la IP cambia seguido, considerar:
- DNS local (router → asignar nombre fijo al servidor)
- DDNS si está en internet
- IP estática del servidor (recomendado, ver sección 8)

---

## 8. Configuración de red

### 8.1 IP estática del servidor (recomendado)

Para que el servidor siempre tenga la misma IP:
1. En tu router, busca el menú "DHCP" o "Reserva de IP".
2. Reserva una IP fija para la MAC del PC servidor (ej. `192.168.1.50`).
3. Reinicia el PC servidor para que tome la nueva IP.

### 8.2 Cómo averiguar la IP actual

En el PC servidor:

```powershell
ipconfig
```

Buscar la sección **"Adaptador de LAN inalámbrica"** o **"Adaptador Ethernet"** y leer la línea `Dirección IPv4`. Ejemplo: `192.168.1.50`.

### 8.3 Abrir el firewall de Windows

El primer arranque del backend Windows preguntará si permitir el acceso a la red. **Decir que sí, en redes privadas**.

Si no aparece el diálogo o lo cerraste, abrir manualmente:
1. `Win+R` → `wf.msc`
2. **Reglas de entrada** → **Nueva regla** → **Puerto** → TCP, puerto `3000` → **Permitir** → solo **Privada**.

### 8.4 Validar conectividad

Desde el móvil (con WiFi conectado a la misma red que el servidor), abrir el navegador y entrar a:

```
http://192.168.X.Y:3000/health
```

Debe mostrar `{"status":"ok",...}`. Si no, revisar:
- Servidor y celular en la misma WiFi.
- Firewall.
- IP correcta.

---

## 9. Operación diaria

### Flujo típico del recolector (móvil)
1. Abre LavaSuit, ingresa con su cuenta.
2. Visita al cliente. Pulsa **+ Nuevo cliente** (si es nuevo) o lo busca.
3. Pulsa **Pedidos** → **+ Nuevo pedido** → selecciona el cliente → agrega prendas/servicios → indica fecha de entrega → **Guardar**.
4. Si está sin WiFi, el pedido queda en cola (chip naranja "Pendiente"). Cuando vuelve la conexión, se sube automáticamente y el chip pasa a verde "Sincronizado".

### Flujo típico del administrador (escritorio)
1. Abre LavaSuit Desktop, ingresa con su cuenta.
2. **Pedidos**: ve la lista en vivo. Cuando un recolector crea o cambia un pedido, aparece sin recargar.
3. Click en una fila → ve detalle, ítems, pagos y saldo.
4. Cambia estado del pedido (`RECIBIDO` → `EN_PROCESO` → `LISTO` → `ENTREGADO`).
5. Cuando el cliente recoge y paga, pulsa **Registrar pago** → ingresa monto y método → guarda. El saldo se actualiza al instante en el móvil del recolector.
6. **Dashboard**: ve total de pedidos y ventas del día y del mes.

### Permisos / roles
- **ADMIN**: ve todo, puede crear usuarios nuevos, modificar empleados.
- **EMPLEADO**: opera pedidos y clientes.
- **CAJERO**: rol disponible (los endpoints actuales lo aceptan, falta UI específica).

---

## 10. Mantener el backend corriendo

### 10.1 Como servicio Windows con PM2

```powershell
npm install -g pm2 pm2-windows-startup

cd C:\Users\USER\Desktop\lavasuit\backend
pm2 start server.js --name lavasuit-backend
pm2 save
pm2-startup install
```

Ahora el backend arranca solo al prender el PC, sobrevive reinicios, y se reinicia automáticamente si crashea.

Comandos útiles:
```powershell
pm2 status                    # ver estado
pm2 logs lavasuit-backend     # ver logs en vivo
pm2 restart lavasuit-backend  # reiniciar
pm2 stop lavasuit-backend     # detener
```

### 10.2 Backup de la base de datos

Crear `C:\backup-lavasuit.bat`:

```batch
@echo off
set FECHA=%date:~-4%%date:~3,2%%date:~0,2%
mysqldump -u lavasuit_user -pTU_PASSWORD lavasuit_db > C:\backups\lavasuit_%FECHA%.sql
```

Programar en **Programador de tareas** (taskschd.msc) → ejecutar diariamente, por ejemplo a las 23:00.

---

## 11. Solución de problemas

### "No se puede conectar al servidor" en móvil / desktop
- ¿Backend corriendo? `pm2 status` o `npm run dev`.
- ¿Misma red? El móvil tiene que estar en la misma WiFi que el servidor.
- ¿Firewall? Ver sección 8.3.
- ¿IP correcta? Reabrir `ipconfig`, comparar con la del `.env` del desktop o `app.json` del móvil.

### "Credenciales incorrectas" pero la contraseña es correcta
- Probablemente el `JWT_SECRET` cambió y aún no reiniciaste el backend. Reiniciar.
- Si dice "Sesión expirada", hacer logout y volver a entrar.

### El móvil muestra "Sin conexión" todo el tiempo
- Verificar que el celular tenga WiFi y que la WiFi tenga acceso al servidor (probar `http://IP:3000/health` desde el navegador del celular).
- Si el `apiHost` en `app.json` apunta a una IP errónea, hay que volver a hacer `npm run build:apk` y reinstalar.

### El desktop muestra "Sin tiempo real" en ámbar
- El backend no acepta conexión Socket.io. Reiniciar el backend.
- Si persiste, ver logs: `pm2 logs lavasuit-backend`.

### Demasiados intentos de login (429)
- Rate-limit de 10 intentos cada 15 minutos. Esperar o subir `RATE_LIMIT_LOGIN_MAX` en `.env` del backend y reiniciar.

### Un pedido se ve en el móvil pero no en el desktop (o viceversa)
- Verificar que ambos apunten al **mismo servidor** (misma IP en el `.env` del desktop y `app.json` del móvil).

### El APK no instala — "App no instalada"
- Hay otra versión de LavaSuit instalada con firma diferente. Desinstalar la versión previa primero.
- O usar el mismo certificado de firma para builds sucesivos (EAS lo guarda por proyecto, no debería pasar).

### El backend arranca pero `npm run dev` muestra `FATAL: JWT_SECRET no está definido`
- Falta `JWT_SECRET` en `.env`. Generar con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y pegar.

### "Demasiados conexiones" en MySQL después de muchas horas
- Reiniciar el backend (`pm2 restart lavasuit-backend`). El cliente Prisma se reconecta limpio.

---

## 12. Checklist final de entrega

Antes de entregar el sistema al cliente, marcar cada punto:

### Servidor
- [ ] MySQL instalado y `lavasuit_db` creada.
- [ ] `backend/.env` con `DATABASE_URL` correcto y `JWT_SECRET` **rotado** (96 caracteres aleatorios).
- [ ] `npx prisma db push` ejecutado y `node prisma/seed.js` corrido.
- [ ] Migraciones versionadas inicializadas (sección 5).
- [ ] Backend levantado con PM2 y configurado para arrancar al boot.
- [ ] Firewall abierto en puerto 3000 solo para red privada.
- [ ] IP estática asignada en el router al PC servidor.
- [ ] Backup diario programado.
- [ ] Contraseña de `admin@lavasuit.com` cambiada (no `admin123`).

### Seguridad
- [ ] `JWT_SECRET` rotado.
- [ ] Password de MySQL no es el de ejemplo.
- [ ] `CORS_ORIGIN` configurado: en LAN puede quedar `*`, si expones a internet poner los dominios exactos.
- [ ] El `.env` del backend **no** está versionado en git (ya viene en `.gitignore`).

### Desktop
- [ ] `desktop\.env` con `VITE_API_URL` apuntando al servidor.
- [ ] `npm run build:installer` corrido.
- [ ] `LavaSuit-Setup-1.0.0.exe` copiado e instalado en cada PC de mostrador.
- [ ] Probado login + crear pedido + cambiar estado + registrar pago.

### Móvil
- [ ] `mobile/app.json` con `apiHost` correcto.
- [ ] `npm run build:apk` corrido en EAS.
- [ ] APK distribuido a cada recolector.
- [ ] Probado en modo offline: crear pedido sin WiFi, conectar, ver que sincroniza.

### Realtime y sync
- [ ] Crear pedido desde móvil → aparece en desktop en segundos.
- [ ] Cambiar estado en desktop → móvil refleja el cambio.
- [ ] Registrar pago en desktop → saldo del pedido cae a 0 en el móvil sin recargar.

### Operativo
- [ ] Operadores capacitados en el flujo básico (sección 9).
- [ ] Documento impreso con credenciales iniciales entregado al admin del cliente.
- [ ] Plan de backup explicado.
- [ ] Contacto para soporte definido.

---

## Anexo: comandos cheatsheet

| Tarea | Comando |
|---|---|
| Levantar backend en dev | `cd backend && npm run dev` |
| Levantar backend como servicio | `pm2 start server.js --name lavasuit-backend` |
| Ver logs del backend | `pm2 logs lavasuit-backend` |
| Reiniciar backend | `pm2 restart lavasuit-backend` |
| Ver datos en MySQL visualmente | `cd backend && npx prisma studio` |
| Aplicar nuevo schema | `cd backend && npx prisma migrate dev --name <nombre>` |
| Aplicar migraciones en producción | `cd backend && npx prisma migrate deploy` |
| Re-seedear datos iniciales | `cd backend && node prisma/seed.js` |
| Correr tests del backend | `cd backend && npm test` |
| Lanzar dev del desktop | `cd desktop && npm run dev` |
| Compilar instalador desktop | `cd desktop && npm run build:installer` |
| Lanzar dev del móvil | `cd mobile && npx expo start` |
| Compilar APK | `cd mobile && npm run build:apk` |
| Generar JWT_SECRET nuevo | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| Backup manual MySQL | `mysqldump -u lavasuit_user -p lavasuit_db > backup.sql` |
| Restaurar backup MySQL | `mysql -u lavasuit_user -p lavasuit_db < backup.sql` |

---

**Versión del documento**: 1.0
**Fecha**: 2026-05-12
