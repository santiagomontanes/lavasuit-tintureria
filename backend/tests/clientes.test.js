const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login }            = require('./__helpers__/auth');

let token;

beforeAll(async () => {
  await resetDb();
  await seedTest();
  token = await login(app);
});

describe('Clientes', () => {
  it('crea cliente válido', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Pedro Pérez', telefono: '988877766' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.nombre).toBe('Pedro Pérez');
  });

  it('rechaza cliente sin nombre con 400', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ telefono: '977665544' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('rechaza cliente sin teléfono con 400', async () => {
    const res = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Solo Nombre' });

    expect(res.status).toBe(400);
  });

  it('lista clientes (al menos el creado)', async () => {
    const res = await request(app)
      .get('/api/clientes')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('sin token devuelve 401', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.status).toBe(401);
  });
});
