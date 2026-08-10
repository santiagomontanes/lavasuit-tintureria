/* Métodos de pago — fuente ÚNICA de verdad para todo el backend.
 *
 * REGLA INVIOLABLE: el método con el que se cobró NUNCA se reescribe.
 * Un pago NEQUI se guarda NEQUI, se reporta NEQUI y se cierra la caja como
 * NEQUI. Lo mismo para DAVIPLATA y TRANSFERENCIA.
 *
 * Antes `normalizarMetodoPago` mapeaba TARJETA/YAPE/PLIN/OTRO → TRANSFERENCIA
 * y `calcularTotalesPago` devolvía totalTarjeta/totalOtro fijos en 0. Eso hacía
 * dos cosas malas: (a) un cobro con tarjeta aparecía como transferencia en el
 * cierre y (b) esos métodos no se podían desglosar aunque existieran filas en
 * la base. Ahora cada método se reporta tal cual y el cierre los muestra solo
 * si tienen movimiento.
 */

/** Métodos que la app ofrece hoy al cobrar. */
const METODOS_PAGO_ACTIVOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA'];

/** Métodos que ya no se ofrecen pero pueden existir en datos históricos.
 *  Se siguen reportando con su nombre real; no se reetiquetan. */
const METODOS_PAGO_LEGACY = ['TARJETA', 'YAPE', 'PLIN', 'OTRO'];

const METODOS_PAGO = [...METODOS_PAGO_ACTIVOS, ...METODOS_PAGO_LEGACY];

/** Único método que mueve el dinero físico de la caja. */
const METODO_EFECTIVO = 'EFECTIVO';

/**
 * Devuelve el método tal cual vino, en mayúsculas. Se conserva la función
 * (y el nombre) porque varios módulos la importan, pero YA NO reetiqueta:
 * un método desconocido cae en 'OTRO' para no romper agregaciones.
 */
const normalizarMetodoPago = (metodo) => {
  const m = String(metodo ?? '').trim().toUpperCase();
  if (!m) return 'OTRO';
  return METODOS_PAGO.includes(m) ? m : 'OTRO';
};

const sumarPorMetodo = (pagos) =>
  pagos.reduce((acc, pago) => {
    const metodo = normalizarMetodoPago(pago.metodo);
    acc[metodo] = (acc[metodo] ?? 0) + Number(pago.monto ?? 0);
    return acc;
  }, {});

/**
 * Totales por método de una lista de pagos.
 * `totalRecibido` suma TODOS los métodos (incluidos los legacy), para que
 * ningún cobro quede fuera del total de la sesión.
 */
const calcularTotalesPago = (pagos) => {
  const porMetodo = sumarPorMetodo(pagos ?? []);
  const de = (m) => porMetodo[m] ?? 0;

  const totalEfectivo      = de('EFECTIVO');
  const totalNequi         = de('NEQUI');
  const totalDaviplata     = de('DAVIPLATA');
  const totalTransferencia = de('TRANSFERENCIA');
  const totalTarjeta       = de('TARJETA');
  // 'Otros' agrupa lo que no tiene columna propia (YAPE/PLIN/OTRO).
  const totalOtro          = de('YAPE') + de('PLIN') + de('OTRO');

  const totalRecibido = Object.values(porMetodo).reduce((acc, v) => acc + v, 0);

  return {
    porMetodo,
    totalRecibido,
    totalEfectivo,
    totalNequi,
    totalDaviplata,
    totalTransferencia,
    totalTarjeta,
    totalOtro,
    totalOtros: totalOtro,
  };
};

module.exports = {
  METODOS_PAGO,
  METODOS_PAGO_ACTIVOS,
  METODOS_PAGO_LEGACY,
  METODO_EFECTIVO,
  normalizarMetodoPago,
  calcularTotalesPago,
};
