const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login }            = require('./__helpers__/auth');
const prisma = require('../src/lib/prisma');

let token, cliente, servicio;

beforeAll(async () => {
  await resetDb();
  const s = await seedTest();
  cliente  = s.cliente;
  servicio = s.servicio;
  token    = await login(app);
});

const crearPedido = (overrides = {}) =>
  request(app)
    .post('/api/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clienteId: cliente.id,
      items: [{ servicioId: servicio.id, cantidad: 1, precio: 10 }],
      ...overrides
    });

describe('Pedidos', () => {
  it('crea pedido válido con total calculado', async () => {
    const res = await crearPedido({
      items: [{ servicioId: servicio.id, cantidad: 3, precio: 10 }]
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.numero).toBeGreaterThan(0);
    expect(Number(res.body.total)).toBe(30);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.cliente?.id).toBe(cliente.id);
  });

  it('rechaza pedido con servicio inexistente con 400', async () => {
    const res = await crearPedido({
      items: [{
        servicioId: '00000000-0000-0000-0000-000000000000',
        cantidad:   1,
        precio:     10
      }]
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Servicios inválidos|Cliente no válido/);
  });

  it('rechaza pedido sin items con 400', async () => {
    const res = await crearPedido({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
  });

  it('cambia estado a EN_PROCESO', async () => {
    const creado = await crearPedido();
    expect(creado.status).toBe(201);

    const res = await request(app)
      .patch(`/api/pedidos/${creado.body.id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'EN_PROCESO' });

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('EN_PROCESO');
  });

  it('rechaza estado inválido con 400', async () => {
    const creado = await crearPedido();
    const res = await request(app)
      .patch(`/api/pedidos/${creado.body.id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'PIRATA' });

    expect(res.status).toBe(400);
  });

  it('soft delete: no aparece en lista pero queda en DB con eliminadoEn', async () => {
    const creado = await crearPedido();
    const id = creado.body.id;

    const del = await request(app)
      .delete(`/api/pedidos/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get('/api/pedidos')
      .set('Authorization', `Bearer ${token}`);
    const encontrado = list.body.pedidos.find((p) => p.id === id);
    expect(encontrado).toBeUndefined();

    const dbRow = await prisma.pedido.findUnique({ where: { id } });
    expect(dbRow).toBeTruthy();
    expect(dbRow.eliminadoEn).not.toBeNull();
  });
});
