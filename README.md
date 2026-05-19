# LavaSuit

Sistema de gestión para tintorerías. Funciona online y offline, con sincronización en tiempo real entre dispositivos.

> 📘 **Para instalación completa en cliente, ver [`docs/INSTALLATION_GUIDE.md`](docs/INSTALLATION_GUIDE.md)** ([PDF entregable](docs/INSTALLATION_GUIDE.pdf)).
>
> ✅ **Para checklist de entrega, ver [`docs/CLIENT_DELIVERY_CHECKLIST.md`](docs/CLIENT_DELIVERY_CHECKLIST.md)**.

---

## Stack

| Componente | Tecnología |
|------------|------------|
| Backend    | Node.js 20 + Express + Prisma + MySQL 8 + Socket.io |
| Desktop    | Electron 41 + React 19 + Vite + Tailwind + TanStack Query |
| Mobile     | Expo SDK 54 + React Native 0.81 + expo-sqlite (offline) + Zustand |
| Licencias  | Supabase (proyecto compartido) |
| Updates    | Desktop: GitHub Releases · Mobile: EAS Update (OTA) |
| Impresión  | Bluetooth térmica 58/80 mm vía `@sofyan.rs/rn-thermal-printer` |

---

## Estructura del repositorio

```
lavasuit/
├── backend/                  Node.js + Prisma + MySQL
├── desktop/                  Electron + React + Vite
├── mobile/                   Expo + React Native
├── database/                 setup.sql, migraciones manuales, seeds
├── docs/
│   ├── INSTALLATION_GUIDE.md       Manual técnico completo
│   ├── INSTALLATION_GUIDE.pdf      PDF entregable (56 pág.)
│   ├── CLIENT_DELIVERY_CHECKLIST.md
│   ├── LEGACY_README.md            README original preservado
│   ├── UPDATES.md
│   ├── build-pdf.js                Regenera el PDF desde el MD
│   └── build-pdf.ps1               Wrapper PowerShell
├── .github/workflows/        desktop-release.yml (CI)
├── iniciar-backend.bat
├── iniciar-desktop.bat
└── iniciar-mobile.bat
```

---

## Quick start — Backend

```powershell
cd backend
npm install
# Crear .env (ver docs/INSTALLATION_GUIDE.md Anexo A)
npx prisma@5.22.0 generate
npx prisma@5.22.0 db push
node prisma/seed.js
npm run dev
# → http://localhost:3000
```

Validaciones:

```powershell
node --check server.js
npx prisma@5.22.0 validate
npm test
```

---

## Quick start — Desktop

```powershell
cd desktop
npm install
npm run dev                 # modo desarrollo
npm run typecheck
npm run build:installer     # genera dist/electron/LavaSuit-Setup-X.Y.Z.exe
npm run build:publish       # publica a GitHub Releases (requiere GH_TOKEN)
```

---

## Quick start — Mobile

```powershell
cd mobile
npm install
# Editar app.json -> extra.apiHost = IP del servidor
npm run typecheck
npm start                   # Expo Dev
npm run android             # build local en USB
npm run build:apk           # APK preview vía EAS
npm run update:preview -- --message "..."   # OTA
```

---

## Releases

| Componente | Mecanismo | Cómo disparar |
|------------|-----------|---------------|
| Desktop    | GitHub Releases + electron-updater | `git tag desktop-vX.Y.Z && git push origin desktop-vX.Y.Z` |
| Mobile OTA | EAS Update                          | `cd mobile && npm run update:preview -- --message "..."` |
| Mobile APK | EAS Build                           | `cd mobile && npm run build:apk` |
| Backend    | Copia manual + `pm2 restart`        | Ver [INSTALLATION_GUIDE.md §11.5](docs/INSTALLATION_GUIDE.md) |

---

## Documentación

- **[Manual de instalación completo](docs/INSTALLATION_GUIDE.md)** — 56 páginas, 13 secciones + 9 anexos.
- **[PDF entregable](docs/INSTALLATION_GUIDE.pdf)** — versión imprimible para llevar al cliente.
- **[Checklist de entrega](docs/CLIENT_DELIVERY_CHECKLIST.md)** — versión resumida.
- **[README original](docs/LEGACY_README.md)** — preservado por referencia.
- **[Updates / releases](docs/UPDATES.md)** — flujo de versiones.

Para regenerar el PDF tras editar el MD:

```powershell
cd docs
node build-pdf.js
# o:  .\build-pdf.ps1
```

---

## Licencia

UNLICENSED — software propietario.
