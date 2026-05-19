# LavaSuit — Checklist de Entrega al Cliente

Versión resumida para usar el día de instalación. Para detalles completos, comandos y troubleshooting ver [`INSTALLATION_GUIDE.md`](INSTALLATION_GUIDE.md).

**Cliente:** _________________________________
**Fecha:** ____ / ____ / ________
**Instalador:** _________________________________

---

## 0. Pre-entrega (en taller)

- [ ] Información del cliente recolectada (razón social, dirección, IP propuesta)
- [ ] Código de licencia generado en Supabase
- [ ] Password MySQL único generado y anotado
- [ ] `JWT_SECRET` único generado (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- [ ] Password admin LavaSuit generado y anotado
- [ ] Instalador `LavaSuit-Setup-X.Y.Z.exe` probado en máquina limpia
- [ ] APK compilado con `apiHost` = IP que se asignará al servidor
- [ ] USB con: Node.js 20 LTS, MySQL 8.0, backend, .exe, APK, este checklist
- [ ] Plantilla acta de entrega impresa
- [ ] Plantilla credenciales lista para llenar
- [ ] Datos de contacto soporte impresos
- [ ] Cable Ethernet de respaldo

---

## 1. Backend — PC servidor del cliente

### Software base

- [ ] Windows actualizado y reiniciado
- [ ] Node.js 20 LTS instalado · `node --version` OK
- [ ] MySQL 8.0 instalado · `Get-Service MySQL80` Running
- [ ] Visual C++ Redistributable instalado (necesario para `better-sqlite3`)

### Instalación backend

- [ ] Carpeta `C:\LavaSuit\` creada con `backend\`, `backups\`, `logs\`
- [ ] Backend copiado a `C:\LavaSuit\backend\` (sin `node_modules`, sin `.env`)
- [ ] `cd C:\LavaSuit\backend && npm install` ejecutado sin errores

---

## 2. MySQL

- [ ] Base `lavasuit_db` creada con `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
- [ ] Usuario `lavasuit_user` creado con password ÚNICA (no la default)
- [ ] `GRANT ALL PRIVILEGES ON lavasuit_db.* TO 'lavasuit_user'@'localhost'`
- [ ] `FLUSH PRIVILEGES` ejecutado
- [ ] Conexión validada: `mysql -u lavasuit_user -p lavasuit_db`

---

## 3. Configuración `.env`

- [ ] `C:\LavaSuit\backend\.env` creado
- [ ] `DATABASE_URL` con password real del cliente
- [ ] `JWT_SECRET` único de 96 hex chars
- [ ] `HOST=0.0.0.0` (no localhost)
- [ ] `PORT=3000`
- [ ] `NODE_ENV=production`
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` reales
- [ ] `LAVASUIT_PRODUCT_TYPE=LAUNDRY`
- [ ] `LICENSE_GRACE_DAYS=7`
- [ ] Permisos del archivo restringidos

---

## 4. Prisma + seed

- [ ] `npx prisma@5.22.0 generate` OK
- [ ] `npx prisma@5.22.0 db push` OK
- [ ] `SHOW TABLES` en MySQL lista todas las tablas
- [ ] `node prisma/seed.js` ejecutado
- [ ] Usuario admin existe en tabla `Usuario`

---

## 5. PM2 (backend como servicio)

- [ ] `npm install -g pm2 pm2-windows-startup` (como admin)
- [ ] `pm2 start server.js --name lavasuit-backend --time`
- [ ] `pm2 save`
- [ ] `pm2-startup install` (como admin)
- [ ] `pm2 install pm2-logrotate` con `max_size 10M` y `retain 30`
- [ ] Reinicio del PC → `pm2 status` muestra backend Running sin login
- [ ] Logs visibles en `pm2 logs lavasuit-backend`

---

## 6. Red y firewall

- [ ] IP fija LAN asignada al adaptador (ej. `192.168.1.10`)
- [ ] IP reservada en el panel del router (por MAC)
- [ ] Gateway, máscara y DNS configurados
- [ ] Regla firewall puerto 3000 creada (perfiles Private + Domain)
- [ ] `Get-NetFirewallRule -DisplayName "LavaSuit*"` muestra la regla
- [ ] `curl http://localhost:3000/health` → 200 OK
- [ ] `curl http://192.168.X.X:3000/health` desde otro dispositivo → 200 OK

---

## 7. Backups

- [ ] Carpeta `C:\LavaSuit\backups\` existe
- [ ] Script `backup.bat` creado con credenciales reales
- [ ] Tarea programada "LavaSuit Backup Diario" registrada (3:00 AM, RunLevel Highest)
- [ ] Ejecución manual: `& "C:\LavaSuit\backups\backup.bat"`
- [ ] `lavasuit_*.sql.zip` generado con tamaño > 100 KB
- [ ] `backup.log` muestra entrada OK

---

## 8. Desktop

Por cada PC desktop:

- [ ] `LavaSuit-Setup-X.Y.Z.exe` instalado
- [ ] Atajo en escritorio y menú inicio
- [ ] App abre sin errores
- [ ] Licencia activada
- [ ] Login admin OK
- [ ] **Password admin CAMBIADA desde la app** ⚠
- [ ] Crear cliente prueba OK
- [ ] Crear pedido prueba OK
- [ ] Imprimir recibo OK
- [ ] Abrir/cerrar caja OK · `efectivoEsperado` cuadra
- [ ] "Buscar actualización" responde OK

---

## 9. Mobile

Por cada celular operario:

- [ ] APK instalado (`lavasuit-<cliente>-vX.Y.Z.apk`)
- [ ] Permisos concedidos: Cámara, Ubicación, Bluetooth, Notificaciones, Fotos
- [ ] Conectado a WiFi del local
- [ ] Licencia activada
- [ ] Login OK
- [ ] Pedidos cargan online
- [ ] Modo avión → crear pedido → desactivar → sincroniza
- [ ] Indicador "online/offline" funciona

---

## 10. Impresión Bluetooth

Por cada impresora:

- [ ] Impresora térmica encendida
- [ ] Emparejada en Ajustes Android (PIN `0000` o `1234`)
- [ ] Seleccionada en LavaSuit → Configuración → Impresora
- [ ] "Imprimir prueba" → ticket sale completo
- [ ] Imprimir recibo real de un pedido → OK
- [ ] Ancho de papel correcto (58 mm o 80 mm)

---

## 11. Capacitación al cliente

- [ ] CRUD clientes
- [ ] CRUD servicios
- [ ] Crear y gestionar pedidos
- [ ] Registrar pagos (efectivo, QR, mixto)
- [ ] Entregar pedido con foto
- [ ] Abrir / cerrar caja
- [ ] Imprimir recibos
- [ ] Crear garantías
- [ ] Importar clientes desde Excel
- [ ] Buscar pedidos por cliente / fecha
- [ ] Qué hacer si se va el WiFi
- [ ] Qué hacer si se apaga el PC servidor

---

## 12. Documentos firmados / entregados

- [ ] Acta de entrega firmada por ambas partes
- [ ] Sobre cerrado con credenciales entregado al admin del cliente
- [ ] Datos de contacto soporte entregados
- [ ] Manual de usuario corto entregado (separado de este manual técnico)
- [ ] Cliente acepta política de revisión semanal de backups

---

## 13. Validación final (humo end-to-end)

10 minutos finales antes de irse:

- [ ] Backend vivo localmente: `curl http://localhost:3000/health`
- [ ] Backend vivo desde LAN: `curl http://<IP>:3000/health` desde celular
- [ ] PM2 sobrevive reinicio del PC servidor
- [ ] Desktop conecta y lista pedidos
- [ ] Mobile conecta y lista pedidos
- [ ] Mobile offline crea pedido y sincroniza al reconectar
- [ ] Impresión Bluetooth desde mobile OK
- [ ] Impresión desde desktop OK
- [ ] Caja: abrir → cobrar efectivo → cerrar → cuadra
- [ ] Updater desktop responde sin error
- [ ] Backup manual ejecutado correctamente

---

## Datos para registrar en sistema interno (al volver al taller)

| Campo | Valor |
|-------|-------|
| Nombre cliente | _________________________ |
| IP servidor | 192.168.____.____ |
| MAC servidor | __:__:__:__:__:__ |
| Versión Desktop entregada | __________ |
| Versión APK entregada | __________ |
| Cantidad de celulares | __________ |
| Cantidad de impresoras | __________ |
| Código de licencia activado | __________ |
| Vigencia licencia | ____/____/________ |
| Versión Backend deployada | __________ |
| Versión Schema Prisma | __________ |
| AnyDesk ID (si se instaló) | __________ |
| Fecha próxima revisión | ____/____/________ |

---

**Firma cliente:** _________________________      **Firma instalador:** _________________________
