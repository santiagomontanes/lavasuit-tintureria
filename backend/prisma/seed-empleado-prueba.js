const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'empleado@lavasuit.com';
  const password = 'empleado123';
  const passwordHash = await bcrypt.hash(password, 10);

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: {
      nombre: 'Empleado Prueba',
      password: passwordHash,
      rol: 'EMPLEADO',
      activo: true
    },
    create: {
      nombre: 'Empleado Prueba',
      email,
      password: passwordHash,
      rol: 'EMPLEADO',
      activo: true
    },
    select: {
      id: true,
      nombre: true,
      email: true,
      rol: true,
      activo: true
    }
  });

  console.log('Usuario empleado de prueba listo:');
  console.log(usuario);
  console.log('Login: empleado@lavasuit.com / empleado123');
}

main()
  .catch((error) => {
    console.error('Error creando/verificando empleado de prueba:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
