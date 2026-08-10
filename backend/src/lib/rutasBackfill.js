const prisma = require('./prisma');

/* #Rutas M2M — Backfill idempotente de la asignación única legacy al modelo
 * muchos-a-muchos. Necesario porque el flujo de actualización usa `db push`
 * (crea la tabla desde el schema pero NO corre el INSERT de la migración SQL).
 *
 * Inserta una fila en ClienteEmpleadoRuta por cada Cliente con `asignadoAId`
 * que todavía no tenga su fila. `skipDuplicates` + el unique(clienteId,usuarioId)
 * lo hacen seguro de correr en cada arranque (normalmente inserta 0). No borra
 * ni modifica nada existente. */
async function backfillRutasDesdeAsignado() {
  try {
    // Sólo los que faltan (asignadoAId presente y sin fila en la intermedia).
    const pendientes = await prisma.cliente.findMany({
      where: {
        asignadoAId: { not: null },
        rutas: { none: {} }
      },
      select: { id: true, asignadoAId: true, ordenBase: true, subOrden: true, activo: true }
    });
    if (pendientes.length === 0) return { migrados: 0 };

    const res = await prisma.clienteEmpleadoRuta.createMany({
      data: pendientes.map((c) => ({
        clienteId: c.id,
        usuarioId: c.asignadoAId,
        orden:     c.ordenBase ?? null,
        subOrden:  c.subOrden ?? 0,
        activo:    c.activo
      })),
      skipDuplicates: true
    });
    console.log(`[rutas-backfill] ${res.count} asignaciones migradas al modelo multi-empleado`);
    return { migrados: res.count };
  } catch (e) {
    // La tabla puede no existir aún (primer arranque antes de db push): no es
    // fatal, se reintenta en el siguiente arranque.
    console.warn('[rutas-backfill] no se pudo ejecutar (¿tabla aún no creada?):', e?.message ?? e);
    return { migrados: 0, error: true };
  }
}

module.exports = { backfillRutasDesdeAsignado };
