const asyncHandler = require('../utils/asyncHandler');
const { HttpError } = require('../middlewares/error.middleware');
const supa = require('../lib/supabaseLicencias');

const PRODUCT_TYPE_LAVASUIT = (process.env.LAVASUIT_PRODUCT_TYPE || 'LAUNDRY').toUpperCase();
const GRACE_DAYS = Math.max(1, Number(process.env.LICENSE_GRACE_DAYS ?? 7));

const sanitize = (s, max = 80) => {
  if (s == null) return null;
  const v = String(s).trim();
  if (!v) return null;
  return v.slice(0, max);
};

/* Valida una licencia + activación. Devuelve un objeto resumen seguro para
 * enviar al cliente (sin la fila completa de Supabase). */
const construirResumen = (lic, activation, motivo = 'ok') => ({
  ok:           true,
  motivo,
  license_key:  lic.license_key,
  status:       lic.status,
  plan:         lic.plan,
  product_type: lic.product_type,
  business_type: lic.business_type,
  business_name: lic.business_name,
  expires_at:   lic.current_period_end,
  max_machines: lic.max_machines,
  device_id:    activation?.machine_id ?? null,
  activation_id: activation?.id ?? null,
  last_seen:    activation?.last_seen ?? null,
  first_seen:   activation?.first_seen ?? null,
  grace_days:   GRACE_DAYS,
  product_esperado: PRODUCT_TYPE_LAVASUIT
});

const validarLicencia = (lic) => {
  if (!lic) {
    throw new HttpError(404, 'Licencia no encontrada');
  }
  if (String(lic.product_type).toUpperCase() !== PRODUCT_TYPE_LAVASUIT) {
    throw new HttpError(403, `Esta licencia no es para LavaSuit (producto: ${lic.product_type})`);
  }
  if (lic.status !== 'ACTIVE') {
    throw new HttpError(403, `Licencia ${lic.status}: contacte al proveedor`);
  }
  if (lic.current_period_end) {
    const exp = new Date(lic.current_period_end);
    if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) {
      throw new HttpError(403, `Licencia vencida el ${exp.toISOString().slice(0, 10)}`);
    }
  }
};

/* POST /api/licencias/activar
 * body: { license_key, device_id, platform: 'desktop'|'mobile', app_version?, business_name? } */
exports.activar = asyncHandler(async (req, res) => {
  if (!supa.licenciasConfiguradas()) {
    throw new HttpError(503, 'Sistema de licencias no configurado en el servidor');
  }

  const licenseKey = sanitize(req.body?.license_key, 64);
  const deviceId   = sanitize(req.body?.device_id, 80);
  const platform   = sanitize(req.body?.platform, 16);
  const appVersion = sanitize(req.body?.app_version, 32);

  if (!licenseKey) throw new HttpError(400, 'license_key requerida');
  if (!deviceId)   throw new HttpError(400, 'device_id requerido');
  if (!platform || !['desktop', 'mobile'].includes(platform)) {
    throw new HttpError(400, "platform debe ser 'desktop' o 'mobile'");
  }

  console.log('[licencia.activar] solicitud', {
    license_key_mask: `${licenseKey.slice(0, 4)}…${licenseKey.slice(-4)}`,
    deviceId_mask:    `${deviceId.slice(0, 4)}…${deviceId.slice(-4)}`,
    platform, appVersion
  });

  const lic = await supa.obtenerLicencia(licenseKey);
  validarLicencia(lic);

  const activaciones = await supa.listarActivaciones(licenseKey);
  let activation = activaciones.find((a) => a.machine_id === deviceId);

  if (!activation) {
    // Nuevo dispositivo: verificar cupo
    if (activaciones.length >= Number(lic.max_machines ?? 1)) {
      throw new HttpError(403, `Límite de dispositivos alcanzado (${lic.max_machines}). Revoca uno desde el panel.`);
    }
    activation = await supa.insertarActivacion(licenseKey, deviceId);
    console.log('[licencia.activar] nuevo dispositivo registrado', { activationId: activation?.id });
  } else {
    // Dispositivo ya activado: refrescar last_seen
    if (activation.id) await supa.actualizarLastSeen(activation.id);
    console.log('[licencia.activar] dispositivo ya registrado, last_seen actualizado');
  }

  res.json(construirResumen(lic, activation, 'activado'));
});

/* POST /api/licencias/verificar
 * Más liviano: verifica que la licencia esté vigente y el dispositivo
 * registrado y no revocado. Refresca last_seen. */
exports.verificar = asyncHandler(async (req, res) => {
  if (!supa.licenciasConfiguradas()) {
    throw new HttpError(503, 'Sistema de licencias no configurado en el servidor');
  }

  const licenseKey = sanitize(req.body?.license_key, 64);
  const deviceId   = sanitize(req.body?.device_id, 80);
  if (!licenseKey) throw new HttpError(400, 'license_key requerida');
  if (!deviceId)   throw new HttpError(400, 'device_id requerido');

  const lic = await supa.obtenerLicencia(licenseKey);
  validarLicencia(lic);

  const activaciones = await supa.listarActivaciones(licenseKey);
  const activation = activaciones.find((a) => a.machine_id === deviceId);
  if (!activation) {
    throw new HttpError(403, 'Dispositivo no activado o revocado. Vuelve a activar.');
  }
  if (activation.id) await supa.actualizarLastSeen(activation.id);

  res.json(construirResumen(lic, activation, 'verificado'));
});
