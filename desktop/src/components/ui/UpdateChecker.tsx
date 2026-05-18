import React, { useEffect, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import Button from './Button';
import Badge from './Badge';
import type { UpdaterEvent } from '../../vite-env';

type Estado = 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

/* Pequeño card para mostrar versión actual y permitir buscar/aplicar updates.
 * Compatible con dev (cuando no hay electron-updater): muestra solo versión. */
export default function UpdateChecker() {
  const [version,  setVersion]  = useState<string>('');
  const [estado,   setEstado]   = useState<Estado>('idle');
  const [progreso, setProgreso] = useState<number>(0);
  const [info,     setInfo]     = useState<string>('');
  const [latest,   setLatest]   = useState<string | null>(null);

  useEffect(() => {
    const api = window.updaterAPI;
    if (!api) return;
    api.getVersion().then(setVersion).catch(() => setVersion('?'));

    const off = api.onEvent((ev: UpdaterEvent) => {
      switch (ev.tipo) {
        case 'checking':
          setEstado('checking'); setInfo('Buscando actualizaciones…'); break;
        case 'available':
          setEstado('available'); setLatest(ev.version); setInfo(`Disponible v${ev.version}`); break;
        case 'not-available':
          setEstado('not-available'); setInfo('Estás en la última versión.'); break;
        case 'progress':
          setEstado('downloading'); setProgreso(ev.percent); setInfo(`Descargando… ${ev.percent}%`); break;
        case 'downloaded':
          setEstado('downloaded'); setInfo(`v${ev.version} lista. Reinicia para instalar.`); break;
        case 'error':
          setEstado('error'); setInfo(ev.message ?? 'Error en actualizaciones'); break;
      }
    });
    return off;
  }, []);

  const buscar = async () => {
    const api = window.updaterAPI;
    if (!api) return;
    setInfo('Buscando…');
    const r = await api.check();
    if (!r.ok) {
      setEstado(r.motivo === 'dev' ? 'idle' : 'error');
      setInfo(r.mensaje ?? 'Error');
      return;
    }
    if (r.updateAvailable) {
      setEstado('available');
      setLatest(r.latestVersion ?? null);
      setInfo(`Disponible v${r.latestVersion}`);
    } else {
      setEstado('not-available');
      setInfo('Estás en la última versión.');
    }
  };

  const descargar = async () => {
    const api = window.updaterAPI;
    if (!api) return;
    setEstado('downloading'); setProgreso(0); setInfo('Descargando…');
    const r = await api.download();
    if (!r.ok) { setEstado('error'); setInfo(r.mensaje ?? 'Error descargando'); }
  };

  const instalar = async () => {
    const api = window.updaterAPI;
    if (!api) return;
    await api.install();
  };

  if (!window.updaterAPI) {
    return (
      <div className="text-xs text-slate-500">
        Versión {version || '—'} · Modo navegador
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900">
          LavaSuit v{version || '—'}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {info || 'Listo para buscar actualizaciones.'}
        </p>
        {estado === 'downloading' && (
          <div className="mt-2 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 transition-all" style={{ width: `${progreso}%` }} />
          </div>
        )}
        {estado === 'available' && latest && (
          <Badge tone="info" outline className="mt-2">Nueva: v{latest}</Badge>
        )}
        {estado === 'not-available' && (
          <Badge tone="success" outline className="mt-2">Al día</Badge>
        )}
        {estado === 'error' && (
          <Badge tone="danger" outline className="mt-2">Error</Badge>
        )}
      </div>
      <div className="flex gap-2">
        {(estado === 'idle' || estado === 'not-available' || estado === 'error') && (
          <Button size="sm" variant="secondary" leftIcon={<RefreshCw size={14} />} onClick={buscar}>
            Buscar
          </Button>
        )}
        {estado === 'checking' && (
          <Button size="sm" variant="secondary" disabled leftIcon={<RotateCcw size={14} className="animate-spin" />}>
            Buscando
          </Button>
        )}
        {estado === 'available' && (
          <Button size="sm" leftIcon={<Download size={14} />} onClick={descargar}>
            Descargar
          </Button>
        )}
        {estado === 'downloading' && (
          <Button size="sm" variant="secondary" disabled leftIcon={<Download size={14} />}>
            {progreso}%
          </Button>
        )}
        {estado === 'downloaded' && (
          <Button size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={instalar}>
            Reiniciar e instalar
          </Button>
        )}
      </div>
    </div>
  );
}
