import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cloud, CloudUpload, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import dayjs from 'dayjs';
import api from '../../services/api';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../ui/Table';
import { useToastStore } from '../../store/toast.store';

/* Copias de seguridad en Google Drive.
 *
 * Mismo sistema que el proyecto de referencia: se autoriza una vez con la
 * cuenta de Google, y cada subida genera un .sql con mysqldump y lo envía a
 * Drive, dejando el estado en la tabla `backups`.
 *
 * La autorización abre el navegador contra Google y vuelve a
 * 127.0.0.1:3017/oauth2callback, que escucha el backend. Por eso hay que
 * autorizar desde el mismo equipo donde corre el servidor.
 */

interface BackupDrive {
  id: number;
  file_name: string;
  drive_file_id: string | null;
  status: 'CREATED' | 'UPLOADING' | 'DONE' | 'ERROR' | string;
  message: string | null;
  created_at: string;
}

const TONO: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  DONE: 'success', UPLOADING: 'warning', ERROR: 'danger', CREATED: 'neutral'
};

export default function BackupGoogleDrive() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const { data: estado } = useQuery({
    queryKey: ['drive-estado'],
    queryFn: async () => (await api.get('/backups/drive/estado')).data as {
      conectado: boolean; credencialesOk: boolean; motivo: string | null; conectadoEn: string | null;
    }
  });

  const { data: backups = [], isFetching, refetch } = useQuery({
    queryKey: ['drive-backups'],
    queryFn: async () => (await api.get('/backups/drive')).data as BackupDrive[]
  });

  const conectar = useMutation({
    mutationFn: async () => (await api.post('/backups/drive/conectar')).data as { authUrl: string },
    onSuccess: (d) => {
      // Se abre en el navegador del sistema: Google no permite OAuth dentro de
      // una ventana de Electron.
      window.open(d.authUrl, '_blank');
      toast('Autoriza el acceso en el navegador. Al terminar, vuelve y actualiza el estado.', 'info');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['drive-estado'] }), 15000);
    },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo iniciar la conexión con Google Drive', 'error')
  });

  const subir = useMutation({
    mutationFn: async () => (await api.post('/backups/drive/subir')).data as { fileName: string },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['drive-backups'] });
      toast(`Backup subido a Google Drive: ${d.fileName}`, 'success');
    },
    onError: (e: any) => {
      qc.invalidateQueries({ queryKey: ['drive-backups'] });
      qc.invalidateQueries({ queryKey: ['drive-estado'] });
      toast(e?.response?.data?.error || 'No se pudo subir el backup', 'error');
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Cloud size={16} className="text-primary-600" />
            Copias en Google Drive
          </span>
        </CardTitle>
        {estado?.conectado
          ? <Badge tone="success" dot>Conectado</Badge>
          : <Badge tone="neutral" outline>Sin conectar</Badge>}
      </CardHeader>

      <CardBody className="space-y-4">
        <p className="text-sm text-slate-600">
          Genera un respaldo completo de la base con <span className="font-medium">mysqldump</span> y
          lo sube a tu Google Drive. Autoriza una sola vez; después basta con pulsar “Subir backup”.
        </p>

        {estado && !estado.credencialesOk && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{estado.motivo}</span>
          </div>
        )}

        {estado?.conectado && estado.conectadoEn && (
          <div className="flex items-center gap-2 rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-sm text-success-700">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>Conectado desde el {dayjs(estado.conectadoEn).format('DD/MM/YYYY HH:mm')}.</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={estado?.conectado ? 'secondary' : 'primary'}
            leftIcon={<Cloud size={15} />}
            onClick={() => conectar.mutate()}
            loading={conectar.isPending}
            disabled={conectar.isPending || estado?.credencialesOk === false}
          >
            {estado?.conectado ? 'Reconectar Google Drive' : 'Conectar Google Drive'}
          </Button>
          <Button
            leftIcon={<CloudUpload size={15} />}
            onClick={() => subir.mutate()}
            loading={subir.isPending}
            disabled={subir.isPending || !estado?.conectado}
          >
            {subir.isPending ? 'Subiendo…' : 'Subir backup'}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />}
            onClick={() => { refetch(); qc.invalidateQueries({ queryKey: ['drive-estado'] }); }}
          >
            Actualizar
          </Button>
        </div>

        {backups.length === 0 ? (
          <EmptyState
            compact
            icon={<Cloud size={20} />}
            title="Sin backups en Drive"
            description="Cuando subas el primero aparecerá aquí con su estado."
          />
        ) : (
          <TableContainer>
            <Table>
              <THead>
                <TR>
                  <TH>Fecha</TH>
                  <TH>Archivo</TH>
                  <TH>Estado</TH>
                  <TH>Detalle</TH>
                </TR>
              </THead>
              <TBody>
                {backups.map((b) => (
                  <TR key={b.id}>
                    <TD className="text-slate-500">{dayjs(b.created_at).format('DD/MM/YYYY HH:mm')}</TD>
                    <TD className="font-mono text-xs text-slate-800">{b.file_name}</TD>
                    <TD><Badge tone={TONO[b.status] ?? 'neutral'} dot>{b.status}</Badge></TD>
                    <TD className="text-slate-500 text-xs">{b.message ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </CardBody>
    </Card>
  );
}
