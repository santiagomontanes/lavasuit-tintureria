const METODOS_PAGO_ACTIVOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA'];
const METODOS_PAGO_LEGACY = ['TARJETA', 'YAPE', 'PLIN', 'OTRO'];

const normalizarMetodoPago = (metodo) => {
  if (METODOS_PAGO_ACTIVOS.includes(metodo)) return metodo;
  if (METODOS_PAGO_LEGACY.includes(metodo)) return 'TRANSFERENCIA';
  return metodo;
};

const sumarPorMetodo = (pagos) =>
  pagos.reduce((acc, pago) => {
    const metodo = normalizarMetodoPago(pago.metodo);
    acc[metodo] = (acc[metodo] ?? 0) + Number(pago.monto);
    return acc;
  }, {});

const calcularTotalesPago = (pagos) => {
  const porMetodo = sumarPorMetodo(pagos);
  const totalEfectivo = porMetodo.EFECTIVO ?? 0;
  const totalNequi = porMetodo.NEQUI ?? 0;
  const totalDaviplata = porMetodo.DAVIPLATA ?? 0;
  const totalTransferencia = porMetodo.TRANSFERENCIA ?? 0;
  const totalRecibido = totalEfectivo + totalNequi + totalDaviplata + totalTransferencia;

  return {
    porMetodo,
    totalRecibido,
    totalEfectivo,
    totalNequi,
    totalDaviplata,
    totalTransferencia,
    totalTarjeta: 0,
    totalOtro: 0,
    totalOtros: 0,
  };
};

module.exports = {
  METODOS_PAGO_ACTIVOS,
  METODOS_PAGO_LEGACY,
  normalizarMetodoPago,
  calcularTotalesPago,
};
