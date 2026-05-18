const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login }            = require('./__helpers__/auth');

beforeAll(async () => {
  await resetDb();
  await seedTest();
});

describe('POST /api/auth/login', () => {
  it('login correcto devuelve token + usuario', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@lavasuit.com', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.usuario).toMatchObject({
      email: 'admin@lavasuit.com',
      rol:   'ADMIN'
    });
  });

  it('login con password incorrecto devuelve 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@lavasuit.com', password: 'mal' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Credenciales incorrectas');
  });

  it('login con email inválido devuelve 400 con errors[]', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-es-email', password: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe('POST /api/auth/registro', () => {
  it('sin token devuelve 401', async () => {
    const res = await request(app)
      .post('/api/auth/registro')
      .send({
        nombre: 'Test',
        email:  'nuevo@lavasuit.com',
        password: 'abc12345'
      });

    expect(res.status).toBe(401);
  });

  it('con token ADMIN crea usuario', async () => {
    const token = await login(app);
    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre:   'Empleado X',
        email:    'empleado-x@lavasuit.com',
        password: 'abc12345',
        rol:      'EMPLEADO'
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      email: 'empleado-x@lavasuit.com',
      rol:   'EMPLEADO'
    });
    expect(res.body.password).toBeUndefined();
  });

  it('rechaza email duplicado con 409', async () => {
    const token = await login(app);
    const res = await request(app)
      .post('/api/auth/registro')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre:   'Otro',
        email:    'admin@lavasuit.com',
        password: 'abc12345'
      });

    expect(res.status).toBe(409);
  });
});
