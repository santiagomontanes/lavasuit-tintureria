# Bootstrap del servidor LavaSuit

Script `backend/scripts/bootstrap.js` que automatiza la instalación del backend en el PC del cliente. Reemplaza los pasos manuales 6.6 a 6.11 del [INSTALLATION_GUIDE.md](INSTALLATION_GUIDE.md).

---

## Qué hace

| # | Paso | Idempotente |
|---|------|-------------|
| 1 | Valida Node, npm, sistema, permisos admin | sí |
| 2 | Detecta MySQL escuchando en :3306 | sí |
| 3 | Lee `backend/.env` existente o lo crea pidiendo valores | sí |
| 4 | Conecta como root MySQL y crea base + usuario **si no existen** | sí |
| 5 | Genera Prisma client + aplica `migrate deploy` (fallback `db push`) | sí |
| 6 | Crea usuario ADMIN si no hay ninguno (pide email + password al técnico) | sí |
| 7 | Abre puerto 3000 en firewall Windows (Private + Domain) | sí |
| 8 | Instala y configura PM2 + `pm2-startup install` | sí |
| 9 | Valida `GET /health` con retry hasta 15s | — |

✅ **No destructivo:** nunca borra datos, nunca corre `seed.js` (que es para desarrollo), nunca aplica `migrate reset`.
✅ **Idempotente:** re-ejecutable sin riesgo. Detecta lo que ya está y solo crea lo faltante.

---

## Uso

### Primera instalación

PowerShell **como administrador**:

```powershell
cd C:\LavaSuit\backend
npm install
npm run bootstrap
```

Flujo interactivo (~5 minutos):

```
─────────────────────────────────────────────────────────────
LavaSuit · Bootstrap del backend
Directorio: C:\LavaSuit\backend
─────────────────────────────────────────────────────────────

[1/9] Validando entorno
   ✓ Node v20.19.0
   ✓ npm 10.8.2
   ✓ Sistema: win32 10.0.26200
   ✓ Permisos administrador: SÍ

[3/9] Configurando .env del backend
   No existe C:\LavaSuit\backend\.env. Se creará.
   Host MySQL [127.0.0.1]:
   Puerto MySQL [3306]:
   Nombre de la base [lavasuit_db]:
   Usuario de aplicación [lavasuit_user]:
   Password para el usuario de aplicación (ENTER para generar): ****
   SUPABASE_SERVICE_ROLE_KEY: *********
   ✓ .env escrito (11 variables)

[2/9] Detectando MySQL
   ✓ Puerto 3306 accesible en 127.0.0.1
   ✓ Servicio MySQL80: Running

[4/9] Verificando base de datos y usuario MySQL
   Se necesitará la password de root MySQL para crear DB/usuario.
   Usuario root MySQL [root]:
   Password root MySQL: ********
   ✓ Conectado como root
   ✓ Base "lavasuit_db" creada
   ✓ Usuario "lavasuit_user"@"localhost" creado
   ✓ Permisos otorgados
   ✓ Validación: lavasuit_user conecta correctamente a lavasuit_db

[5/9] Aplicando schema Prisma
   ✓ Cliente Prisma generado
   ✓ Migraciones aplicadas

[6/9] Verificando usuario administrador
   No hay usuarios ADMIN. Creando uno...
   Email del admin [admin@lavasuit.com]:
   Nombre del admin [Administrador]:
   Password (mín 8 caracteres): ********
   Confirmar password: ********
   ✓ Admin creado: admin@lavasuit.com

[7/9] Configurando firewall
   ✓ Regla "LavaSuit Backend 3000" creada (Private + Domain)

[8/9] Configurando PM2
   PM2 no detectado. ¿Instalar globalmente? (S/n): S
   ✓ PM2 instalado
   ✓ Proceso lavasuit-backend arrancado
   ✓ pm2 save aplicado
   ✓ pm2-startup install aplicado (sobrevive reinicio)

[9/9] Validando /health
   ✓ Respuesta 200: {"status":"ok","db":"mysql","timestamp":"..."}

─────────────────────────────────────────────────────────────
✓ Bootstrap completado en 47.2s
  Backend:    http://localhost:3000
  IP LAN:     http://192.168.1.10:3000
  Logs:       pm2 logs lavasuit-backend
  Estado:     pm2 status
─────────────────────────────────────────────────────────────
```

### Re-ejecución (tras update del backend)

Mismo comando — el script detecta que la DB existe, los usuarios existen, etc., y solo aplica lo nuevo (migraciones pendientes, restart de PM2):

```powershell
cd C:\LavaSuit\backend
git pull
npm install
npm run bootstrap
```

### Flags

| Flag | Efecto |
|------|--------|
| `--skip-firewall` | No crea regla de firewall |
| `--skip-pm2` | No instala ni configura PM2 |
| `--skip-admin` | No crea usuario admin (asume que ya existe externamente) |
| `--yes` / `-y` | Acepta defaults sin preguntar (no usar en primera instalación) |

Ejemplo: re-aplicar schema sin tocar PM2 ni firewall:

```powershell
node scripts/bootstrap.js --skip-firewall --skip-pm2 --skip-admin
```

---

## Variables `.env` que crea el script

```ini
DATABASE_URL="mysql://lavasuit_user:GENERADA@127.0.0.1:3306/lavasuit_db"
JWT_SECRET="<96-hex-chars>"        # auto-generado con crypto.randomBytes(48)
JWT_EXPIRES_IN="7d"
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
CORS_ORIGIN=*
SUPABASE_URL=https://awutehzbhhklcgodmluq.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<input-del-tecnico>
LAVASUIT_PRODUCT_TYPE=LAUNDRY
LICENSE_GRACE_DAYS=7
```

---

## Comportamiento ante errores

| Situación | Qué hace el script |
|-----------|--------------------|
| MySQL no escucha en :3306 | Aborta en paso 2 con mensaje claro |
| Password root MySQL incorrecta | Aborta en paso 4 con error mysql2 |
| Schema con datos pre-existentes y migrate falla | Fallback automático a `db push --skip-generate` |
| Ya hay un admin | No crea otro, solo loguea cuántos hay |
| Firewall sin permisos admin | Warning, no aborta (puede aplicarse luego) |
| PM2 ya tiene el proceso | `pm2 reload` en lugar de duplicar |
| `/health` no responde en 15s | Aborta con instrucción de revisar `pm2 logs` |

---

## Prueba manual rápida (sin cliente)

En tu PC dev con MySQL ya instalado:

```powershell
cd C:\Users\USER\Desktop\lavasuit\backend
npm run bootstrap --skip-firewall --skip-pm2
```

Esto evita tocar firewall y PM2 globalmente, pero ejecuta los pasos 1-6 + validación `/health`.

---

## Qué NO hace (intencional)

- ❌ NO instala MySQL — el cliente debe instalarlo manualmente (sección 6.3 del INSTALLATION_GUIDE)
- ❌ NO instala Node.js — debe instalarse manualmente
- ❌ NO corre `seed.js` — ese script crea usuarios y datos demo destructivos
- ❌ NO asigna IP fija LAN — depende del router del cliente (sección 6.9)
- ❌ NO configura backup MySQL automático — usar [INSTALLATION_GUIDE §8.2-8.3](INSTALLATION_GUIDE.md)
- ❌ NO sube ni descarga nada de la red — todo es local

---

## Versionado

| Fecha | Cambios |
|-------|---------|
| 2026-05-18 | v1 — release inicial con 9 pasos automatizados |
