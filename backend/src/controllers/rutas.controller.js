const prisma = require('../lib/prisma');
const asyncHandler = require('../utils/asyncHandler');
const clientesCtrl = require('./clientes.controller');

/*
 * El modelo elegido es de "asignación directa": cada Cliente apunta a un
 * empleado vía `asignadoAId`. Por eso una "ruta" no es una entidad propia,
 * sino la vista agregada de los clientes asignados a un empleado.
 */

/*
 * GET /api/rutas  (solo ADMIN)
 * Lista los empleados con el resumen de su ruta: total de clientes asignados
 * y el rango de ordenBase que cubren.
 */
exports.listar = asyncHandler(async (req, res) => {
  const empleados = await prisma.usuario.findMany({
    where:   { activo: true },
    select:  { id: true, nombre: true, email: true, rol: true },
    orderBy: { nombre: 'asc' }
  });

  const grupos = await prisma.cliente.groupBy({
    by:    ['asignadoAId'],
    where: { asignadoAId: { not: null }, activo: true },
    _count: { _all: true },
    _min:   { ordenBase: true },
    _max:   { ordenBase: true }
  });

  const porUsuario = new Map(grupos.map((g) => [g.asignadoAId, g]));

  const rutas = empleados.map((e) => {
    const g = porUsuario.get(e.id);
    return {
      usuarioId:     e.id,
      nombre:        e.nombre,
      email:         e.email,
      rol:           e.rol,
      totalClientes: g?._count?._all ?? 0,
      ordenMin:      g?._min?.ordenBase ?? null,
      ordenMax:      g?._max?.ordenBase ?? null
    };
  });

  res.json(rutas);
});

/*
 * POST /api/rutas  (solo ADMIN)
 * Con el modelo de asignación directa, "crear una ruta" es asignar un grupo
 * de clientes (rango o lista) a un empleado. Reutilizamos el controlador de
 * asignación de clientes.
 */
exports.crear = clientesCtrl.asignar;
