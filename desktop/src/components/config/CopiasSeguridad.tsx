import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, FolderOpen, RefreshCw, ShieldCheck, FileArchive } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../services/api';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/Card';
import { useToastStore } from '../../store/toast.store';

interface Backup {
  archivo:       string;
  ruta:          string;
  formato:       'sql' | 'json';
  comprimido:    boolean;
  tamanoBytes:   number;
  usuarioNombre: string | null;
  motivo:        string;
  createdAt:     string;
}
interface ListaBackups { carpeta: string; backups: Backup[]; }

const formatBytes = (n: number): string => {
  if (!n) return '0 KB';
  const kb = n / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(2)} MB`;
};

const motivoLabel = (m: string) =>
  m === 'cierre-dia-automatico' ? 'Automático (cierre de día)' : 'Manual';

export default function CopiasSeguridad() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => (await api.get('/backups')).data as ListaBackups
  });

  const generar = useMutation({
    mutationFn: async () => (await api.post('/backups/generar')).data as Backup,
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      toast(`Backup generado: ${b.archivo} (${b.formato.toUpperCase()})`, 'success');
    },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo generar el backup', 'error')
  });

  const abrirCarpeta = async () => {
    const carpeta = data?.carpeta;
    if (!carpeta) return;
    if (!window.shellAPI?.openPath) {
      toast('Abrir carpeta solo está disponible en la app de escritorio (y si el servidor es esta misma máquina).', 'info');
      return;
    }
    const err = await window.shellAPI.openPath(carpeta);
    if (err) toast(`No se pudo abrir la carpeta (¿el servidor está en otra máquina?): ${err}`, 'error');
  };

  const backups = data?.backups ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <DatabaseBackup size={16} className="text-primary-600" /> Copias de seguridad
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button leftIcon={<ShieldCheck size={15} />} loading={generar.isPending} onClick={() => generar.mutate()}>
            Generar backup ahora
          </Button>
          <Button variant="secondary" leftIcon={<FolderOpen size={15} />} onClick={abrirCarpeta} disabled={!data?.carpeta}>
            Abrir carpeta
          </Button>
          <Button variant="ghost" leftIcon={<RefreshCw size={15} />} loading={isFetching} onClick={() => refetch()}>
            Actualizar
          </Button>
        </div>

        {data?.carpeta && (
          <p className="text-xs text-slate-500">
            Carpeta en el servidor: <span className="font-mono text-slate-700">{data.carpeta}</span>
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Cargando backups…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-slate-400">Aún no hay copias de seguridad generadas.</p>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div key={b.archivo} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-2">
                    <FileArchive size={14} className="text-slate-400 shrink-0" /> {b.archivo}
                  </p>
                  <p className="text-xs text-slate-500">
                    {dayjs(b.createdAt).format('DD/MM/YYYY HH:mm')} · {formatBytes(b.tamanoBytes)} ·
                    {' '}{b.usuarioNombre ?? '—'} · {motivoLabel(b.motivo)}
                  </p>
                </div>
                <Badge tone={b.comprimido ? 'success' : 'neutral'} outline>
                  {b.formato.toUpperCase()}{b.comprimido ? ' · GZ' : ''}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Los respaldos se generan con <code>mysqldump</code> (.sql) o, si no está disponible, como JSON
          estructurado; se comprimen con gzip (.gz) cuando es posible. No se eliminan backups antiguos automáticamente.
        </p>
      </CardBody>
    </Card>
  );
}
