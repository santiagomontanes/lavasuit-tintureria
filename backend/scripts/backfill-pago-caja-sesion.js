'use strict';
/* Backfill idempotente de Pago.cajaSesionId.
 *
 * Producción actualiza el esquema con `prisma db push` (ver update-backend.ps1),
 * que agrega la columna Pago.cajaSesionId pero NO corre el backfill que sí trae
 * el migration.sql. Sin backfill, los pagos existentes quedan cajaSesionId=NULL
 * y el arqueo (filtro ESTRICTO por sesión) los cuenta como 0 — problema real
 * para una caja que esté ABIERTA al momento de actualizar.
 *
 * Este script empareja cada pago sin sesión con la CajaSesion de SU usuario cuya
 * ventana [fechaApertura, fechaCierre|ahora] contiene el createdAt del pago
 * (la apertura más reciente <= createdAt si varias coinciden). Es idempotente:
 * solo toca filas con cajaSesionId IS NULL. Nunca falla la actualización: si la
 * columna aún no existe o hay cualquier error, sale con código 0 y lo registra.
 *
 * Lo invoca scripts/update-backend.ps1 después del db push. Correrlo dos veces
 * no cambia nada tras la primera pasada.
 */
const prisma = require('../src/lib/prisma');

async function main() {
  // Si la columna aún no existe (db push no aplicó), no hay nada que hacer.
  const cols = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Pago' AND COLUMN_NAME = 'cajaSesionId'`
  );
  const existeColumna = Number(cols?.[0]?.n ?? 0) > 0;
  if (!existeColumna) {
    console.log('BACKFILL_SKIP columna Pago.cajaSesionId no existe todavia');
    return;
  }

  const afectadas = await prisma.$executeRawUnsafe(
    `UPDATE \`Pago\` p
        SET p.\`cajaSesionId\` = (
          SELECT c.\`id\` FROM \`CajaSesion\` c
           WHERE c.\`usuarioId\` = p.\`usuarioId\`
             AND c.\`fechaApertura\` <= p.\`createdAt\`
             AND (c.\`fechaCierre\` IS NULL OR p.\`createdAt\` <= c.\`fechaCierre\`)
           ORDER BY c.\`fechaApertura\` DESC
           LIMIT 1
        )
      WHERE p.\`cajaSesionId\` IS NULL
        AND p.\`usuarioId\` IS NOT NULL`
  );
  console.log(`BACKFILL_OK filas actualizadas: ${afectadas}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('BACKFILL_FAIL ' + (e && e.message)); process.exit(0); });
