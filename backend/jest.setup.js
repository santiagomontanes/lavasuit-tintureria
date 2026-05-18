process.env.NODE_ENV = 'test';

require('dotenv').config({ path: '.env.test' });

if (!process.env.DATABASE_URL) {
  console.error('\nERROR: DATABASE_URL no está definido para tests.');
  console.error('Crea backend/.env.test (copia desde .env.test.example) y define DATABASE_URL.\n');
  process.exit(1);
}

if (!/test/i.test(process.env.DATABASE_URL)) {
  console.error('\nERROR: la DATABASE_URL no contiene la palabra "test".');
  console.error('Por seguridad, los tests solo corren contra una DB cuyo nombre incluya "test".');
  console.error('Edita backend/.env.test y apúntala a lavasuit_test_db.\n');
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'jest-test-secret';
}
