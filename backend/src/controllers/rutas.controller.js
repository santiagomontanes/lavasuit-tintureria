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

  /* #Rutas M2M: contamos desde la tabla intermedia (un cliente puede estar en
   * varias rutas). Sólo asignaciones activas de clientes activos. Se agrega en
   * memoria para no depender de filtros por relación en groupBy. */
  const filas = await prisma.clienteEmpleadoRuta.findMany({
    where:  { activo: true, cliente: { activo: true } },
    select: { usuarioId: true, orden: true }
  });

  const porUsuario = new Map();
  for (const f of filas) {
    let g = porUsuario.get(f.usuarioId);
    if (!g) { g = { total: 0, min: null, max: null }; porUsuario.set(f.usuarioId, g); }
    g.total += 1;
    if (f.orden != null) {
      g.min = g.min == null ? f.orden : Math.min(g.min, f.orden);
      g.max = g.max == null ? f.orden : Math.max(g.max, f.orden);
    }
  }

  const rutas = empleados.map((e) => {
    const g = porUsuario.get(e.id);
    return {
      usuarioId:     e.id,
      nombre:        e.nombre,
      email:         e.email,
      rol:           e.rol,
      totalClientes: g?.total ?? 0,
      ordenMin:      g?.min ?? null,
      ordenMax:      g?.max ?? null
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
