import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Network,
  RotateCw,
  Server,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Field, Input, Textarea, inputClassName } from '../components/ui/Input';
import { cn } from '../lib/cn';
import type { ServerInstallerDetect, ServerInstallerLog } from '../vite-env';

type Protocol = 'http' | 'https';
type TestResult = { ok: boolean; status?: number; mensaje?: string } | null;
type InstallerResult = { ok: boolean; error?: string } | null;

interface Props {
  motivoBackendCaido?: boolean;
  onCancelar?: () => void;
}

export default function ConfigurarServidorPage({ motivoBackendCaido, onCancelar }: Props) {
  const [apiProtocol, setApiProtocol] = useState<Protocol>('http');
  const [apiHost, setApiHost] = useState('localhost');
  const [apiPort, setApiPort] = useState(3000);
  const [loadedConfig, setLoadedConfig] = useState(false);
  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<TestResult>(null);

  const [detecting, setDetecting] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [installerResult, setInstallerResult] = useState<InstallerResult>(null);
  const [diagnostico, setDiagnostico] = useState<ServerInstallerDetect | null>(null);
  const [logs, setLogs] = useState<ServerInstallerLog[]>([]);
  const [mysqlRootUser, setMysqlRootUser] = useState('root');
  const [mysqlRootPass, setMysqlRootPass] = useState('');
  const [dbName, setDbName] = useState('lavasuit_db');
  const [dbUser, setDbUser] = useState('lavasuit_user');
  const [dbPass, setDbPass] = useState('');
  const [adminEmail, setAdminEmail] = useState('admin@lavasuit.com');
  const [adminName, setAdminName] = useState('Administrador');
  const [adminPassword, setAdminPassword] = useState('');
  const [supabaseUrl, setSupabaseUrl] = useState('https://awutehzbhhklcgodmluq.supabase.co');
  const [supabaseKey, setSupabaseKey] = useState('');
  const logsRef = useRef<HTMLDivElement | null>(null);

  const electronDisponible = typeof window !== 'undefined' && !!window.configAPI;
  const installerDisponible = typeof window !== 'undefined' && !!window.serverInstallerAPI;

  const fullUrl = `${apiProtocol}://${apiHost}:${apiPort}`;
  const valido = !!apiHost.trim() && Number.isFinite(apiPort) && apiPort > 0 && apiPort < 65536;

  const refrescarDiagnostico = async () => {
    if (!installerDisponible) return;
    setDetecting(true);
    try {
      setDiagnostico(await window.serverInstallerAPI!.detect());
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (!electronDisponible) {
      setLoadedConfig(true);
      return;
    }
    window.configAPI!.get()
      .then((c) => {
        setApiProtocol(c.apiProtocol);
        setApiHost(c.apiHost);
        setApiPort(c.apiPort);
      })
      .finally(() => setLoadedConfig(true));
  }, [electronDisponible]);

  useEffect(() => {
    if (!installerDisponible) return undefined;
    refrescarDiagnostico();
    const offLog = window.serverInstallerAPI!.onLog((payload) => {
      setLogs((prev) => [...prev.slice(-350), payload]);
    });
    const offDone = window.serverInstallerAPI!.onDone((payload) => {
      setInstallerResult(payload);
      setPreparing(false);
      refrescarDiagnostico();
    });
    return () => {
      offLog();
      offDone();
    };
  }, [installerDisponible]);

  useEffect(() => {
    logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight });
  }, [logs]);

  const probar = async () => {
    if (!electronDisponible || !valido) return;
    setProbing(true);
    setResult(null);
    try {
      setResult(await window.configAPI!.test(fullUrl));
    } finally {
      setProbing(false);
    }
  };

  const guardarYRecargar = async () => {
    if (!electronDisponible || !valido) return;
    setSaving(true);
    try {
      await window.configAPI!.set({ apiHost: apiHost.trim(), apiPort: Number(apiPort), apiProtocol });
      window.configAPI!.reload();
    } catch (e) {
      setResult({ ok: false, mensaje: (e as Error)?.message || 'Error al guardar' });
      setSaving(false);
    }
  };

  const elevar = async () => {
    if (!installerDisponible) return;
    const r = await window.serverInstallerAPI!.elevate();
    if (!r.ok && !r.alreadyAdmin) {
      setInstallerResult({ ok: false, error: r.error || r.reason || 'No se pudo solicitar permisos de administrador' });
    }
  };

  const copiarBackend = async () => {
    if (!installerDisponible) return;
    setInstallerResult(null);
    const r = await window.serverInstallerAPI!.copy();
    setInstallerResult(r);
    await refrescarDiagnostico();
  };

  const prepararServidor = async () => {
    if (!installerDisponible || preparing) return;
    setPreparing(true);
    setInstallerResult(null);
    setLogs([]);
    const r = await window.serverInstallerAPI!.prepare({
      dbHost: '127.0.0.1',
      dbPort: 3306,
      dbName,
      dbUser,
      dbPass,
      mysqlRootUser,
      mysqlRootPass,
      adminEmail,
      adminName,
      adminPassword,
      supabaseUrl,
      supabaseKey,
    });
    setInstallerResult(r);
    setPreparing(false);
    await refrescarDiagnostico();
  };

  const checks = useMemo(() => {
    if (!diagnostico) return [];
    return [
      { label: 'Backend empaquetado', ok: diagnostico.bundle.available, detail: diagnostico.bundle.path },
      { label: 'Backend instalado', ok: diagnostico.backend.installed, detail: diagnostico.backend.target },
      { label: 'Node.js', ok: diagnostico.node.installed, detail: diagnostico.node.version || 'No detectado' },
      { label: 'npm', ok: diagnostico.npm.installed, detail: diagnostico.npm.version || 'No detectado' },
      {
        label: 'MySQL80 / 3306',
        ok: diagnostico.mysql.running && diagnostico.mysql.serviceStatus === 'RUNNING',
        detail: diagnostico.mysql.serviceExists === false
          ? 'Servicio MySQL80 no existe'
          : `${diagnostico.mysql.serviceStatus || 'Estado desconocido'} · puerto 3306 ${diagnostico.mysql.running ? 'OK' : 'sin respuesta'}`,
      },
      { label: 'PM2 instalado', ok: diagnostico.pm2.installed, detail: diagnostico.pm2.path || 'No detectado' },
      { label: 'PM2 backend online', ok: !!diagnostico.pm2.process?.online, detail: diagnostico.pm2.process?.status || 'No registrado' },
      { label: 'Firewall 3000', ok: !!diagnostico.firewall?.configured, detail: diagnostico.firewall?.ruleName || 'Regla no detectada' },
      { label: 'Health localhost', ok: !!diagnostico.health?.localhost?.ok, detail: 'http://127.0.0.1:3000/health' },
      { label: 'Health LAN', ok: !!diagnostico.health?.lan?.ok, detail: diagnostico.health?.lanIp ? `http://${diagnostico.health.lanIp}:3000/health` : 'Sin IP LAN' },
    ];
  }, [diagnostico]);

  const logClass = (level?: string, stream?: string) => cn(
    'whitespace-pre-wrap break-words py-0.5',
    level === 'error' || stream === 'stderr' ? 'text-danger-600' :
      level === 'warn' ? 'text-warning-700' :
        level === 'ok' ? 'text-success-700' :
          level === 'step' ? 'text-primary-700 font-semibold' :
            'text-slate-600'
  );

  if (!loadedConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="animate-spin h-8 w-8 rounded-full border-2 border-slate-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-slate-100 px-4 py-8">
      <div className="w-full max-w-6xl bg-white rounded-xl shadow-card border border-slate-200 overflow-hidden">
        <div className="p-7 border-b border-slate-200/70 bg-gradient-to-br from-primary-50 to-white">
          <div className="flex items-start gap-3">
            <div className="h-11 w-11 rounded-lg bg-primary-600 text-white flex items-center justify-center shadow-card shrink-0">
              <Server size={22} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 leading-tight">Configurar servidor</h1>
              <p className="text-sm text-slate-600 mt-1 leading-snug">
                Indica dónde está el backend LavaSuit o prepara este equipo como servidor local.
              </p>
            </div>
          </div>
        </div>

        {motivoBackendCaido && (
          <div className="px-7 py-3 bg-warning-50 border-b border-warning-200 text-warning-800 text-sm flex gap-2 items-start">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>No se pudo conectar al backend con la configuración actual. Verifica la IP y que el backend esté corriendo.</div>
          </div>
        )}

        <div className="p-7 grid grid-cols-1 xl:grid-cols-[minmax(340px,430px)_1fr] gap-7">
          <section className="space-y-5">
            {!electronDisponible && (
              <div className="bg-slate-50 border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-lg">
                Modo navegador detectado. La configuración se persiste solo en la app Electron.
              </div>
            )}

            <div className="grid grid-cols-12 gap-3">
              <Field label="Protocolo" className="col-span-4">
                <select value={apiProtocol} onChange={(e) => setApiProtocol(e.target.value as Protocol)} className={inputClassName}>
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </Field>
              <Field label="IP o host" className="col-span-8" hint="Ej. 192.168.1.10 o localhost">
                <Input value={apiHost} onChange={(e) => setApiHost(e.target.value)} placeholder="192.168.1.10" autoFocus />
              </Field>
            </div>

            <Field label="Puerto" hint="Default 3000">
              <Input type="number" min={1} max={65535} value={apiPort} onChange={(e) => setApiPort(Number(e.target.value))} />
            </Field>

            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs text-slate-600">
              Probar: {fullUrl}/health
            </div>

            {result && (
              <div className={cn(
                'flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm',
                result.ok ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-800'
              )}>
                {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <div>
                  {result.ok ? `Backend respondió correctamente (HTTP ${result.status ?? 200}).` : `Conexión falló: ${result.mensaje || 'sin detalles'}`}
                </div>
              </div>
            )}

            <div className="pt-2 flex flex-col-reverse sm:flex-row gap-3">
              {onCancelar && (
                <Button variant="ghost" onClick={onCancelar} className="sm:w-32" disabled={saving || preparing}>
                  Cancelar
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={probar}
                disabled={!electronDisponible || !valido || probing || saving || preparing}
                leftIcon={probing ? <RotateCw size={14} className="animate-spin" /> : undefined}
                block
              >
                {probing ? 'Probando...' : 'Probar conexión'}
              </Button>
              <Button onClick={guardarYRecargar} disabled={!electronDisponible || !valido || saving || preparing} loading={saving} block>
                Guardar y recargar
              </Button>
            </div>

            <div className="text-xs text-slate-500 pt-1 border-t border-slate-100 mt-2">
              La configuración se guarda en <code className="bg-slate-100 px-1 py-0.5 rounded">%APPDATA%\LavaSuit\config.json</code>.
              Al guardar, la app se recarga para aplicar la nueva URL.
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Preparar servidor local</h2>
                <p className="text-xs text-slate-500 mt-1">Copia backend, instala dependencias, ejecuta bootstrap, configura PM2 y valida red.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={refrescarDiagnostico} loading={detecting} disabled={!installerDisponible || preparing}>
                  Diagnóstico
                </Button>
                {diagnostico && !diagnostico.isAdmin && (
                  <Button variant="danger" size="sm" onClick={elevar} disabled={preparing} leftIcon={<ShieldAlert size={14} />}>
                    Admin
                  </Button>
                )}
              </div>
            </div>

            {!installerDisponible && (
              <div className="bg-warning-50 border border-warning-200 text-warning-800 text-sm px-3 py-2 rounded-lg">
                El instalador local solo está disponible dentro de Electron.
              </div>
            )}

            {diagnostico && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {checks.map((c) => (
                  <div key={c.label} className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50/70">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-slate-800">{c.label}</span>
                      <Badge tone={c.ok ? 'success' : 'warning'} outline dot>{c.ok ? 'OK' : 'Pendiente'}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 truncate" title={String(c.detail)}>{c.detail}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Root MySQL">
                <Input value={mysqlRootUser} onChange={(e) => setMysqlRootUser(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Password root MySQL">
                <Input type="password" value={mysqlRootPass} onChange={(e) => setMysqlRootPass(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Base de datos">
                <Input value={dbName} onChange={(e) => setDbName(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Usuario app">
                <Input value={dbUser} onChange={(e) => setDbUser(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Password usuario app" hint="Vacío genera una clave si no existe .env">
                <Input type="password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Email admin">
                <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Nombre admin">
                <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} disabled={preparing} />
              </Field>
              <Field label="Password admin" hint="Requerido solo si no existe ADMIN">
                <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} disabled={preparing} />
              </Field>
            </div>

            <Field label="SUPABASE_URL">
              <Input value={supabaseUrl} onChange={(e) => setSupabaseUrl(e.target.value)} disabled={preparing} />
            </Field>
            <Field label="SUPABASE_SERVICE_ROLE_KEY" hint="No se guarda en Desktop; solo se pasa al bootstrap para crear .env si falta.">
              <Textarea value={supabaseKey} onChange={(e) => setSupabaseKey(e.target.value)} disabled={preparing} className="font-mono text-xs" />
            </Field>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="secondary" onClick={copiarBackend} disabled={!installerDisponible || preparing} leftIcon={<Copy size={14} />} block>
                Copiar backend
              </Button>
              <Button onClick={prepararServidor} disabled={!installerDisponible || preparing} loading={preparing} leftIcon={<Wrench size={14} />} block>
                Preparar servidor
              </Button>
              <Button variant="secondary" onClick={probar} disabled={!electronDisponible || probing || preparing} leftIcon={<Network size={14} />} block>
                Probar health
              </Button>
            </div>

            {installerResult && (
              <div className={cn(
                'flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm',
                installerResult.ok ? 'bg-success-50 border-success-200 text-success-800' : 'bg-danger-50 border-danger-200 text-danger-800'
              )}>
                {installerResult.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
                <div>{installerResult.ok ? 'Operación completada.' : `Operación falló: ${installerResult.error || 'sin detalles'}`}</div>
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-950">
              <div className="h-9 px-3 border-b border-white/10 flex items-center gap-2 text-slate-200 text-xs">
                <Terminal size={14} />
                Logs de preparación
              </div>
              <div ref={logsRef} className="h-64 overflow-y-auto p-3 bg-white font-mono text-xs">
                {logs.length === 0 ? (
                  <div className="text-slate-400">Sin logs todavía.</div>
                ) : logs.map((l, idx) => (
                  <div key={`${idx}-${l.line}`} className={logClass(l.level, l.stream)}>{l.line}</div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
