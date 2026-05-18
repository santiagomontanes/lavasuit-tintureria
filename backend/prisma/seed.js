const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed...');

  const hash = await bcrypt.hash('admin123', 10);
  await prisma.usuario.upsert({
    where:  { email: 'admin@lavasuit.com' },
    update: {},
    create: { nombre: 'Administrador', email: 'admin@lavasuit.com', password: hash, rol: 'ADMIN' }
  });

  const hash2 = await bcrypt.hash('empleado123', 10);
  await prisma.usuario.upsert({
    where:  { email: 'empleado@lavasuit.com' },
    update: {},
    create: { nombre: 'Juan Empleado', email: 'empleado@lavasuit.com', password: hash2, rol: 'EMPLEADO' }
  });

  const servicios = [
    { nombre: 'Lavado simple',    precio: 5.00,  unidad: 'prenda' },
    { nombre: 'Lavado + plancha', precio: 8.00,  unidad: 'prenda' },
    { nombre: 'Lavado en seco',   precio: 15.00, unidad: 'prenda' },
    { nombre: 'Edredón doble',    precio: 25.00, unidad: 'unidad' },
    { nombre: 'Edredón simple',   precio: 18.00, unidad: 'unidad' },
    { nombre: 'Zapatos',          precio: 12.00, unidad: 'par'    },
    { nombre: 'Terno completo',   precio: 35.00, unidad: 'unidad' },
    { nombre: 'Camisa formal',    precio: 6.00,  unidad: 'prenda' },
    { nombre: 'Abrigo / Casaca',  precio: 20.00, unidad: 'prenda' },
  ];

  for (const s of servicios) {
    await prisma.servicio.create({ data: s });
  }

  const clientes = [
    { nombre: 'María García',   telefono: '987654321', email: 'maria@gmail.com'  },
    { nombre: 'Carlos López',   telefono: '912345678', email: 'carlos@gmail.com' },
    { nombre: 'Ana Rodríguez',  telefono: '956789012', email: 'ana@gmail.com'    },
    { nombre: 'Pedro Martínez', telefono: '934567890'                             },
  ];

  for (const c of clientes) {
    await prisma.cliente.create({ data: c });
  }

  console.log('Seed completado exitosamente');
  console.log('Admin: admin@lavasuit.com / admin123');
}

main()
  .catch((e) => { console.error('Error en seed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
