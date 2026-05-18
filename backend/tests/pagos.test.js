const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login }            = require('./__helpers__/auth');

let token, cliente, servicio;

beforeAll(async () => {
  await resetDb();
  const s = await seedTest();
  cliente  = s.cliente;
  servicio = s.servicio;
  token    = await login(app);
});

const crearPedido = async (precio = 10, cantidad = 1) => {
  const res = await request(app)
    .post('/api/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clienteId: cliente.id,
      items:     [{ servicioId: servicio.id, cantidad, precio }]
    });
  expect(res.status).toBe(201);
  return res.body.id;
};

const pagar = (pedidoId, monto, metodo = 'EFECTIVO') =>
  request(app)
    .post('/api/pagos')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedidoId, monto, metodo });

describe('Pagos', () => {
  it('registra pago válido y devuelve 201', async () => {
    const id = await crearPedido();
    const res = await pagar(id, 10);

    expect(res.status).toBe(201);
    expect(Number(res.body.monto)).toBe(10);
    expect(res.body.metodo).toBe('EFECTIVO');
    expect(res.body.pedidoId).toBe(id);
  });

  it('rechaza pago mayor al saldo con 400', async () => {
    const id = await crearPedido();
    const res = await pagar(id, 999);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/supera saldo pendiente/i);
  });

  it('rechaza pago a pedido CANCELADO con 400', async () => {
    const id = await crearPedido();
    await request(app)
      .patch(`/api/pedidos/${id}/estado`)
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'CANCELADO' });

    const res = await pagar(id, 5);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelado/i);
  });

  it('rechaza segundo pago si el pedido ya está pagado completamente', async () => {
    const id = await crearPedido();

    const r1 = await pagar(id, 10);
    expect(r1.status).toBe(201);

    const r2 = await pagar(id, 1);
    expect(r2.status).toBe(400);
    expect(r2.body.error).toMatch(/pagado completamente/i);
  });

  it('permite pagos parciales hasta cubrir el total', async () => {
    const id = await crearPedido();

    const r1 = await pagar(id, 4);
    expect(r1.status).toBe(201);

    const r2 = await pagar(id, 6);
    expect(r2.status).toBe(201);

    const r3 = await pagar(id, 0.01);
    expect(r3.status).toBe(400);
  });

  it('rechaza monto negativo o cero con 400 (validación zod)', async () => {
    const id = await crearPedido();
    const r1 = await pagar(id, 0);
    expect(r1.status).toBe(400);
    const r2 = await pagar(id, -1);
    expect(r2.status).toBe(400);
  });
});
