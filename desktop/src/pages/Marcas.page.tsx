import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, Power, PowerOff, Search, Tag } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import Button from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { inputClassName } from '../components/ui/Input';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import MarcaFormModal from '../components/forms/MarcaForm.modal';
import ImportarExcelModal from '../components/forms/ImportarExcel.modal';
import { useToastStore } from '../store/toast.store';
import { useAuthStore } from '../store/auth.store';
import { cn } from '../lib/cn';

interface Marca {
  id:           string;
  nombre:       string;
  codigo?:      string | null;
  abreviaturas?: string | null;
  activo:       boolean;
  createdAt:    string;
  updatedAt:    string;
  creadoPor?:   { id: string; nombre: string } | null;
}

const fetchMarcas = async (): Promise<Marca[]> => {
  const { data } = await api.get('/marcas', { params: { incluyeInactivas: true } });
  return data;
};

export default function MarcasPage() {
  const qc = useQueryClient();
  const toast = useToastStore();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [busqueda, setBusqueda]   = useState('');
  const [busDeb,   setBusDeb]     = useState('');
  const [filtro,   setFiltro]     = useState<'TODOS' | 'ACTIVAS' | 'INACTIVAS'>('ACTIVAS');
  const [openForm, setOpenForm]   = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [editando, setEditando]   = useState<Marca | null>(null);
  const [aDesactivar, setADesact] = useState<Marca | null>(null);

  useEffect(() => { const t = setTimeout(() => setBusDeb(busqueda), 250); return () => clearTimeout(t); }, [busqueda]);

  const { data: marcas = [], isLoading } = useQuery({
    queryKey: ['marcas', 'all'],
    queryFn:  fetchMarcas
  });

  const visibles = useMemo(() => {
    const q = busDeb.trim().toLowerCase();
    return marcas.filter((m) => {
      if (filtro === 'ACTIVAS'   && !m.activo) return false;
      if (filtro === 'INACTIVAS' && m.activo)  return false;
      if (!q) return true;
      return (
        m.nombre.toLowerCase().includes(q) ||
        (m.codigo ?? '').toLowerCase().includes(q) ||
        (m.abreviaturas ?? '').toLowerCase().includes(q)
      );
    });
  }, [marcas, busDeb, filtro]);

  const desactivar = useMutation({
    mutationFn: (id: string) => api.delete(`/marcas/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marcas'] }); toast.show('Marca desactivada', 'success'); setADesact(null); },
    onError:   (e: any) => toast.show(e?.response?.data?.error || 'No se pudo desactivar', 'error')
  });
  const reactivar = useMutation({
    mutationFn: (m: Marca) => api.patch(`/marcas/${m.id}`, { activo: true }).then((r) => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['marcas'] }); toast.show('Marca reactivada', 'success'); },
    onError:    (e: any) => toast.show(e?.response?.data?.error || 'No se pudo reactivar', 'error')
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Marcas"
        description="Define las marcas de prendas (Zara, Nike, etc.) y sus abreviaturas para autocomplete."
        meta={<Badge tone="info" outline>{marcas.length} marcas</Badge>}
        actions={
          esAdmin && (
            <div className="flex gap-2">
              <Button variant="secondary" leftIcon={<FileSpreadsheet size={16} />} onClick={() => setOpenImport(true)}>
                Importar Excel
              </Button>
              <Button leftIcon={<Plus size={16} />} onClick={() => { setEditando(null); setOpenForm(true); }}>
                Nueva marca
              </Button>
            </div>
          )
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, código o abreviatura…"
              className={cn(inputClassName, 'pl-9')}
            />
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['ACTIVAS', 'INACTIVAS', 'TODOS'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  'px-3 h-8 text-xs font-medium rounded-md transition-colors',
                  filtro === f ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                )}
              >{f === 'ACTIVAS' ? 'Activas' : f === 'INACTIVAS' ? 'Inactivas' : 'Todas'}</button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Cargando marcas…" />
      ) : visibles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Tag size={22} />}
            title="No hay marcas para mostrar"
            description={busDeb ? 'Cambia el filtro o el término.' : 'Crea la primera marca o importa desde Excel.'}
            action={esAdmin ? <Button leftIcon={<Plus size={16} />} onClick={() => { setEditando(null); setOpenForm(true); }}>Nueva marca</Button> : undefined}
          />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Marca</TH>
                <TH>Código</TH>
                <TH>Abreviaturas</TH>
                <TH>Estado</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visibles.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center ring-1 ring-primary-100">
                        <Tag size={16} />
                      </div>
                      <span className="font-semibold text-slate-950">{m.nombre}</span>
                    </div>
                  </TD>
                  <TD>{m.codigo ? <code className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{m.codigo}</code> : <span className="text-slate-400">—</span>}</TD>
                  <TD><span className="text-slate-700 text-sm">{m.abreviaturas || <span className="text-slate-400">—</span>}</span></TD>
                  <TD><Badge tone={m.activo ? 'success' : 'neutral'} dot>{m.activo ? 'Activa' : 'Inactiva'}</Badge></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {esAdmin && (
                        <>
                          <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => { setEditando(m); setOpenForm(true); }}>Editar</Button>
                          {m.activo ? (
                            <Button size="sm" variant="ghost" leftIcon={<PowerOff size={14} />} onClick={() => setADesact(m)}>Desactivar</Button>
                          ) : (
                            <Button size="sm" variant="ghost" leftIcon={<Power size={14} />} onClick={() => reactivar.mutate(m)}>Reactivar</Button>
                          )}
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}

      <MarcaFormModal open={openForm} onClose={() => { setOpenForm(false); setEditando(null); }} marca={editando} />

      <ImportarExcelModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        titulo="Importar marcas desde Excel"
        subtitulo="Hoja 'marcas' con columnas: codigo, nombre, abreviaturas, activo."
        endpointImport="/marcas/importar-excel"
        endpointPlantilla="/marcas/plantilla-excel"
        invalidarQueryKeys={[['marcas']]}
      />

      <ConfirmDialog
        open={!!aDesactivar}
        title="Desactivar marca"
        message={aDesactivar ? `¿Seguro que deseas desactivar "${aDesactivar.nombre}"? Los pedidos históricos no se verán afectados.` : ''}
        confirmLabel="Desactivar"
        destructive
        loading={desactivar.isPending}
        onCancel={() => setADesact(null)}
        onConfirm={() => aDesactivar && desactivar.mutate(aDesactivar.id)}
      />
    </div>
  );
}
