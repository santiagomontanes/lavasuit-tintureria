const { PrismaClient } = require('@prisma/client');

const logLevels = process.env.NODE_ENV === 'production'
  ? ['error']
  : ['error', 'warn'];

const prisma = global.__lavasuitPrisma || new PrismaClient({ log: logLevels });

if (process.env.NODE_ENV !== 'production') {
  global.__lavasuitPrisma = prisma;
}

module.exports = prisma;
