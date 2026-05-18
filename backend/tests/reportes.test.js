const request = require('supertest');
const app = require('./__helpers__/app');
const { resetDb, seedTest } = require('./__helpers__/seed');
const { login } = require('./__helpers__/auth');

let token, cliente, servicio;

beforeAll(async () => {
  await resetDb();
  const s = await seedTest();
  cliente = s.cliente;
  servicio = s.servicio;
  token = await login(app);
});

const crearPedido = async (precio = 10, cantidad = 1) => {
  const res = await request(app)
    .post('/api/pedidos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      clienteId: cliente.id,
      items: [{ servicioId: servicio.id, cantidad, precio }]
    });

  expect(res.status).toBe(201);
  return res.body;
};

const pagar = (pedidoId, monto, metodo = 'EFECTIVO') =>
  request(app)
    .post('/api/pagos')
    .set('Authorization', `Bearer ${token}`)
    .send({ pedidoId, monto, metodo });

const ventasDia = () =>
  request(app)
    .get('/api/reportes/ventas-dia')
    .set('Authorization', `Bearer ${token}`);

const cajaRecolector = () =>
  request(app)
    .get('/api/reportes/caja-recolector')
    .set('Authorization', `Bearer ${token}`);

describe('Reportes financieros', () => {
  it('calcula ventas con pagos recibidos y no con el total de pedidos', async () => {
    const pedido = await crearPedido(10, 3);

    const sinPago = await ventasDia();
    expect(sinPago.status).toBe(200);
    expect(Number(sinPago.body.valorOrdenado)).toBe(30);
    expect(Number(sinPago.body.totalPagado)).toBe(0);
    expect(Number(sinPago.body.total)).toBe(0);
    expect(Number(sinPago.body.totalPendiente)).toBe(30);

    const parcial = await pagar(pedido.id, 12, 'EFECTIVO');
    expect(parcial.status).toBe(201);

    const conParcial = await ventasDia();
    expect(Number(conParcial.body.valorOrdenado)).toBe(30);
    expect(Number(conParcial.body.totalPagado)).toBe(12);
    expect(Number(conParcial.body.total)).toBe(12);
    expect(Number(conParcial.body.totalPendiente)).toBe(18);
    expect(Number(conParcial.body.pagosPorMetodo.EFECTIVO)).toBe(12);

    const total = await pagar(pedido.id, 18, 'TRANSFERENCIA');
    expect(total.status).toBe(201);

    const conTotal = await ventasDia();
    expect(Number(conTotal.body.valorOrdenado)).toBe(30);
    expect(Number(conTotal.body.totalPagado)).toBe(30);
    expect(Number(conTotal.body.totalPendiente)).toBe(0);
    expect(Number(conTotal.body.pagosPorMetodo.EFECTIVO)).toBe(12);
    expect(Number(conTotal.body.pagosPorMetodo.TRANSFERENCIA)).toBe(18);

    const caja = await cajaRecolector();
    expect(caja.status).toBe(200);
    expect(Number(caja.body.totalPagado)).toBe(30);
    expect(Number(caja.body.total)).toBe(30);
    expect(Number(caja.body.pagosPorMetodo.EFECTIVO)).toBe(12);
    expect(Number(caja.body.pagosPorMetodo.TRANSFERENCIA)).toBe(18);
  });
});
