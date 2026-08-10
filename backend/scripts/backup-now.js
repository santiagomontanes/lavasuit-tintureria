'use strict';
/* Crea un backup de la base ANTES de db push (best-effort).
 * Lo invoca scripts/update-backend.ps1. Nunca falla la actualización: si el
 * backup no se puede crear, igual sale con código 0 (db push es aditivo). */
const { generarBackup } = require('../src/lib/backup');

generarBackup({ motivo: 'pre-update-auto' })
  .then((r) => { console.log('BACKUP_OK ' + (r && r.archivo)); process.exit(0); })
  .catch((e) => { console.error('BACKUP_FAIL ' + (e && e.message)); process.exit(0); });
