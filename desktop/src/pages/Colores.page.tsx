import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, PowerOff, Search, Palette } from 'lucide-react';
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
import ColorFormModal from '../components/forms/ColorForm.modal';
import { useToastStore } from '../store/toast.store';
import { useAuthStore } from '../store/auth.store';
import { cn } from '../lib/cn';

interface Color {
  id:         string;
  nombre:     string;
  codigo?:    string | null;
  hex?:       string | null;
  activo:     boolean;
  createdAt:  string;
  updatedAt:  string;
}

const fetchColores = async (): Promise<Color[]> => {
  const { data } = await api.get('/colores', { params: { incluyeInactivos: true } });
  return data;
};

export default function ColoresPage() {
  const qc = useQueryClient();
  const toast = useToastStore();
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [busqueda, setBusqueda]   = useState('');
  const [busDeb,   setBusDeb]     = useState('');
  const [filtro,   setFiltro]     = useState<'TODOS' | 'ACTIVOS' | 'INACTIVOS'>('ACTIVOS');
  const [openForm, setOpenForm]   = useState(false);
  const [editando, setEditando]   = useState<Color | null>(null);
  const [aDesactivar, setADesact] = useState<Color | null>(null);

  useEffect(() => { const t = setTimeout(() => setBusDeb(busqueda), 250); return () => clearTimeout(t); }, [busqueda]);

  const { data: colores = [], isLoading } = useQuery({
    queryKey: ['colores', 'all'],
    queryFn:  fetchColores
  });

  const visibles = useMemo(() => {
    const q = busDeb.trim().toLowerCase();
    return colores.filter((c) => {
      if (filtro === 'ACTIVOS'   && !c.activo) return false;
      if (filtro === 'INACTIVOS' && c.activo)  return false;
      if (!q) return true;
      return (
        c.nombre.toLowerCase().includes(q) ||
        (c.codigo ?? '').toLowerCase().includes(q)
      );
    });
  }, [colores, busDeb, filtro]);

  const desactivar = useMutation({
    mutationFn: (id: string) => api.delete(`/colores/${id}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['colores'] }); toast.show('Color desactivado', 'success'); setADesact(null); },
    onError:   (e: any) => toast.show(e?.response?.data?.error || 'No se pudo desactivar', 'error')
  });
  const reactivar = useMutation({
    mutationFn: (c: Color) => api.patch(`/colores/${c.id}`, { activo: true }).then((r) => r.data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['colores'] }); toast.show('Color reactivado', 'success'); },
    onError:    (e: any) => toast.show(e?.response?.data?.error || 'No se pudo reactivar', 'error')
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Colores"
        description="Define los colores que tus operarios podrán elegir para color base y color destino en cada prenda."
        meta={<Badge tone="info" outline>{colores.length} colores</Badge>}
        actions={
          esAdmin && (
            <Button leftIcon={<Plus size={16} />} onClick={() => { setEditando(null); setOpenForm(true); }}>
              Nuevo color
            </Button>
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
              placeholder="Buscar por nombre o código…"
              className={cn(inputClassName, 'pl-9')}
            />
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['ACTIVOS', 'INACTIVOS', 'TODOS'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  'px-3 h-8 text-xs font-medium rounded-md transition-colors',
                  filtro === f ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                )}
              >{f === 'ACTIVOS' ? 'Activos' : f === 'INACTIVOS' ? 'Inactivos' : 'Todos'}</button>
            ))}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Cargando colores…" />
      ) : visibles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Palette size={22} />}
            title="No hay colores para mostrar"
            description={busDeb ? 'Cambia el filtro o el término.' : 'Crea el primer color del catálogo.'}
            action={esAdmin ? <Button leftIcon={<Plus size={16} />} onClick={() => { setEditando(null); setOpenForm(true); }}>Nuevo color</Button> : undefined}
          />
        </Card>
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Color</TH>
                <TH>Código</TH>
                <TH>Hex</TH>
                <TH>Estado</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visibles.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <span
                        className="h-8 w-8 rounded-lg border border-slate-200 shadow-inner shrink-0"
                        style={{ backgroundColor: c.hex || '#e2e8f0' }}
                        aria-label={c.hex ? `Vista del color ${c.nombre}` : 'Color sin hex'}
                      />
                      <span className="font-semibold text-slate-950">{c.nombre}</span>
                    </div>
                  </TD>
                  <TD>{c.codigo ? <code className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c.codigo}</code> : <span className="text-slate-400">—</span>}</TD>
                  <TD>{c.hex ? <code className="text-xs text-slate-700">{c.hex.toUpperCase()}</code> : <span className="text-slate-400">—</span>}</TD>
                  <TD><Badge tone={c.activo ? 'success' : 'neutral'} dot>{c.activo ? 'Activo' : 'Inactivo'}</Badge></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      {esAdmin && (
                        <>
                          <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => { setEditando(c); setOpenForm(true); }}>Editar</Button>
                          {c.activo ? (
                            <Button size="sm" variant="ghost" leftIcon={<PowerOff size={14} />} onClick={() => setADesact(c)}>Desactivar</Button>
                          ) : (
                            <Button size="sm" variant="ghost" leftIcon={<Power size={14} />} onClick={() => reactivar.mutate(c)}>Reactivar</Button>
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

      <ColorFormModal open={openForm} onClose={() => { setOpenForm(false); setEditando(null); }} color={editando} />

      <ConfirmDialog
        open={!!aDesactivar}
        title="Desactivar color"
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
