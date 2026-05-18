const sesionAbiertaDeUsuario = (prisma, usuarioId) =>
  prisma.sesionTrabajo.findFirst({
    where: { usuarioId, estado: 'ABIERTA' },
    orderBy: { fechaInicio: 'desc' }
  });

const recalcularSesionTrabajo = async (tx, sesionTrabajoId) => {
  if (!sesionTrabajoId) return;

  const [totalPedidos, pagos] = await Promise.all([
    tx.pedido.count({
      where: { sesionTrabajoId, eliminadoEn: null, estado: { not: 'CANCELADO' } }
    }),
    tx.pago.findMany({
      where: {
        sesionTrabajoId,
        pedido: { eliminadoEn: null, estado: { not: 'CANCELADO' } }
      },
      select: { monto: true }
    })
  ]);

  const totalPagado = pagos.reduce((acc, p) => acc + Number(p.monto), 0);
  await tx.sesionTrabajo.update({
    where: { id: sesionTrabajoId },
    data: { totalPedidos, totalPagado }
  });
};

module.exports = {
  sesionAbiertaDeUsuario,
  recalcularSesionTrabajo
};
