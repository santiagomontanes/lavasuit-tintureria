/* Cliente liviano para consultar la BD de licencias en Supabase (proyecto
 * compartido con pos-v2/admin/panel-licencias). Usa fetch + service_role
 * desde variables de entorno; NO se expone al frontend. */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ensureConfig = () => {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    const err = new Error('Licencias deshabilitadas: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en backend');
    err.code = 'LICENCIAS_NO_CONFIG';
    throw err;
  }
};

const headers = () => ({
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json'
});

const restUrl = (path) => `${SUPABASE_URL}/rest/v1${path}`;

/* GET licenses?license_key=eq.X — devuelve la fila o null. */
const obtenerLicencia = async (licenseKey) => {
  ensureConfig();
  const url = restUrl(`/licenses?license_key=eq.${encodeURIComponent(licenseKey)}&select=*&limit=1`);
  const res = await fetch(url, { method: 'GET', headers: headers() });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase licenses GET HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
};

/* GET activations no revocadas para una licencia. */
const listarActivaciones = async (licenseKey) => {
  ensureConfig();
  const url = restUrl(
    `/license_activations?license_key=eq.${encodeURIComponent(licenseKey)}&revoked=eq.false&select=id,machine_id,last_seen,first_seen,revoked`
  );
  const res = await fetch(url, { method: 'GET', headers: headers() });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase activations GET HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
};

const insertarActivacion = async (licenseKey, machineId) => {
  ensureConfig();
  const url = restUrl('/license_activations');
  const body = [{
    license_key: licenseKey,
    machine_id:  machineId,
    revoked:     false,
    first_seen:  new Date().toISOString(),
    last_seen:   new Date().toISOString()
  }];
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body:    JSON.stringify(body)
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Supabase activations POST HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : rows;
};

const actualizarLastSeen = async (activationId) => {
  ensureConfig();
  const url = restUrl(`/license_activations?id=eq.${encodeURIComponent(activationId)}`);
  const res = await fetch(url, {
    method: 'PATCH',
    headers: headers(),
    body:    JSON.stringify({ last_seen: new Date().toISOString() })
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn(`[licencias] no se pudo actualizar last_seen: ${res.status} ${txt.slice(0, 150)}`);
  }
};

const licenciasConfiguradas = () => !!(SUPABASE_URL && SERVICE_KEY);

module.exports = {
  obtenerLicencia,
  listarActivaciones,
  insertarActivacion,
  actualizarLastSeen,
  licenciasConfiguradas
};
