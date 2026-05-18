# LavaSuit — Cómo iniciar el sistema

## Credenciales
- Email: admin@lavasuit.com
- Password: admin123

## Terminal 1 — Backend
```
cd C:\Users\USER\Desktop\lavasuit\backend
npm run dev
```
Verifica en: http://localhost:3000/health

## Terminal 2 — Mobile
Edita primero: mobile\src\services\api.service.ts
Cambia la IP por la tuya (ejecuta ipconfig para encontrarla)

```
cd C:\Users\USER\Desktop\lavasuit\mobile
npx expo start
```
Presiona 'a' para Android o escanea el QR con Expo Go

## Terminal 3 — Desktop
```
cd C:\Users\USER\Desktop\lavasuit\desktop
npm run dev
```

## Comandos útiles
- Ver DB visual:     cd backend && npx prisma studio
- Nuevo seed:        cd backend && node prisma/seed.js
- Build desktop exe: cd desktop && npm run build
