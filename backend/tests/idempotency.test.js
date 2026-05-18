const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login } = require('./__helpers__/auth');
const prisma = require('../src/lib/prisma');

let token, cliente, servicio;

const meta = (clientMutationId) => ({
  clientMutationId,
  deviceId: 'device-test-001',
  createdOfflineAt: '2026-05-13T12:00:00.000Z'
});

beforeEach(async () => {
  await resetDb();
  const s = await seedTest();
  cliente = s.cliente;
  servicio = s.servicio;
  token = await login(app);
});

describe('Idempotencia de sincronizacion offline', () => {
  it('mismo clientMutationId para pedido crea solo 1 pedido y el reintento devuelve 200', async () => {
    const payload = {
      clienteId: cliente.id,
      items: [{ servicioId: servicio.id, cantidad: 2, precio: 10 }],
      ...meta('pedido-mut-001')
    };

    const r1 = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    const r2 = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);

    const count = await prisma.pedido.count();
    const ops = await prisma.syncOperation.count({
      where: { clientMutationId: 'pedido-mut-001', deviceId: 'device-test-001' }
    });
    expect(count).toBe(1);
    expect(ops).toBe(1);
  });

  it('mismo clientMutationId para cliente crea solo 1 cliente', async () => {
    const payload = {
      nombre: 'Cliente Idempotente',
      telefono: '988880001',
      ...meta('cliente-mut-001')
    };

    const r1 = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    const r2 = await request(app)
      .post('/api/clientes')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(200);
    expect(r2.body.id).toBe(r1.body.id);

    const matches = await prisma.cliente.findMany({
      where: { telefono: '988880001' }
    });
    expect(matches).toHaveLength(1);
  });

  it('reintento despues de respuesta perdida devuelve la entidad previa', async () => {
    const payload = {
      clienteId: cliente.id,
      items: [{ servicioId: servicio.id, cantidad: 1, precio: 15 }],
      notas: 'Simula timeout: el cliente no recibio la respuesta inicial',
      ...meta('pedido-timeout-mut-001')
    };

    const primeraRespuestaPerdida = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(primeraRespuestaPerdida.status).toBe(201);

    const retry = await request(app)
      .post('/api/pedidos')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(primeraRespuestaPerdida.body.id);
    expect(Number(retry.body.total)).toBe(15);

    const pedidos = await prisma.pedido.findMany({
      where: { clienteId: cliente.id }
    });
    expect(pedidos).toHaveLength(1);
  });
});
