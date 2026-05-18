const bcrypt = require('bcryptjs');
const prisma = require('../../src/lib/prisma');

async function resetDb() {
  await prisma.syncOperation.deleteMany();
  await prisma.pago.deleteMany();
  await prisma.pedidoItem.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.servicio.deleteMany();
  await prisma.usuario.deleteMany();
}

async function seedTest() {
  const admin = await prisma.usuario.create({
    data: {
      nombre:   'Admin Test',
      email:    'admin@lavasuit.com',
      password: bcrypt.hashSync('admin123', 10),
      rol:      'ADMIN'
    }
  });

  const cliente = await prisma.cliente.create({
    data: { nombre: 'Cliente Test', telefono: '999111000' }
  });

  const servicio = await prisma.servicio.create({
    data: { nombre: 'Servicio Test', precio: 10, unidad: 'prenda' }
  });

  return { admin, cliente, servicio };
}

module.exports = { resetDb, seedTest };
