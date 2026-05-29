import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Package, Pencil, Plus, PowerOff, Power, Search, Star, Tags, Trash2, UserRound } from 'lucide-react';
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
import ServicioFormModal from '../components/forms/ServicioForm.modal';
import ImportarExcelModal from '../components/forms/ImportarExcel.modal';
import { useToastStore } from '../store/toast.store';
import { useAuthStore } from '../store/auth.store';
import { cn } from '../lib/cn';

interface Servicio {
  id:               string;
  nombre:           string;
  precio:           string | number;
  unidad:           string;
  categoria?:       string | null;
  descripcion?:     string | null;
  activo:           boolean;
  esPersonalizado?: boolean;
  createdAt:        string;
  updatedAt:        string;
  creadoPor?:       { id: string; nombre: string } | null;
  actualizadoPor?:  { id: string; nombre: string } | null;
}

type Filtro = 'TODOS' | 'ACTIVOS' | 'INACTIVOS';

const fetchServicios = async (): Promise<Servicio[]> => {
  const { data } = await api.get('/servicios', { params: { incluyeInactivos: true } });
  return data;
};

const fmtFecha = (s?: string) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return s; }
};

export default function ServiciosPage() {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [busqueda,     setBusqueda]     = useState('');
  const [busquedaDeb,  setBusquedaDeb]  = useState('');
  const [filtroEstado, setFiltroEstado] = useState<Filtro>('ACTIVOS');
  const [categoria,    setCategoria]    = useState<string | null>(null);
  const [vista,        setVista]        = useState<'tabla' | 'tarjetas'>('tabla');

  const [openForm,    setOpenForm]    = useState(false);
  const [openImport,  setOpenImport]  = useState(false);
  const [editando,    setEditando]    = useState<Servicio | null>(null);
  const [aDesactivar, setADesactivar] = useState<Servicio | null>(null);
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDeb(busqueda), 250);
    return () => clearTimeout(t);
  }, [busqueda]);

  const { data: servicios = [], isLoading } = useQuery({
    queryKey: ['servicios', 'all'],
    queryFn:  fetchServicios
  });

  const categorias = useMemo(() => {
    const set = new Set<string>();
    for (const s of servicios) if (s.categoria) set.add(s.categoria);
    return Array.from(set).sort();
  }, [servicios]);

  const visibles = useMemo(() => {
    const q = busquedaDeb.trim().toLowerCase();
    return servicios.filter((s) => {
      if (filtroEstado === 'ACTIVOS' && !s.activo) return false;
      if (filtroEstado === 'INACTIVOS' && s.activo) return false;
      if (categoria && (s.categoria ?? '') !== categoria) return false;
      if (!q) return true;
      return (
        s.nombre.toLowerCase().includes(q) ||
        (s.categoria ?? '').toLowerCase().includes(q) ||
        (s.descripcion ?? '').toLowerCase().includes(q)
      );
    });
  }, [servicios, busquedaDeb, filtroEstado, categoria]);

  const totales = useMemo(() => ({
    activos:    servicios.filter((s) => s.activo).length,
    inactivos:  servicios.filter((s) => !s.activo).length,
    personalizados: servicios.filter((s) => s.esPersonalizado).length
  }), [servicios]);

  const desactivarMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/servicios/${id}`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      toast.show('Servicio desactivado', 'success');
      setADesactivar(null);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo desactivar';
      toast.show(msg, 'error');
    }
  });

  const reactivarMutation = useMutation({
    mutationFn: (s: Servicio) => api.patch(`/servicios/${s.id}`, { activo: true }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      toast.show('Servicio reactivado', 'success');
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo reactivar';
      toast.show(msg, 'error');
    }
  });

  const abrirEditar = (s: Servicio) => { setEditando(s); setOpenForm(true); };
  const abrirCrear  = ()              => { setEditando(null); setOpenForm(true); };
  const cerrarForm  = ()              => { setOpenForm(false); setEditando(null); };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catálogo"
        title="Prendas"
        description="Define, edita e importa el catálogo de prendas. Los pedidos históricos conservan el nombre y precio originales."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success" outline>{totales.activos} activos</Badge>
            {totales.inactivos > 0 && <Badge tone="neutral" outline>{totales.inactivos} inactivos</Badge>}
            {totales.personalizados > 0 && <Badge tone="warning" outline>{totales.personalizados} personalizados</Badge>}
          </div>
        }
        actions={
          <div className="flex gap-2">
            {esAdmin && (
              <Button variant="secondary" leftIcon={<FileSpreadsheet size={16} />} onClick={() => setOpenImport(true)}>
                Importar Excel
              </Button>
            )}
            <Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Nueva prenda</Button>
          </div>
        }
      />

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, categoría o descripción"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className={cn(inputClassName, 'pl-9')}
            />
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['ACTIVOS', 'INACTIVOS', 'TODOS'] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltroEstado(f)}
                className={cn(
                  'px-3 h-8 text-xs font-medium rounded-md transition-colors',
                  filtroEstado === f
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {f === 'ACTIVOS' ? 'Activos' : f === 'INACTIVOS' ? 'Inactivos' : 'Todos'}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(['tabla', 'tarjetas'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                className={cn(
                  'px-3 h-8 text-xs font-medium rounded-md transition-colors capitalize',
                  vista === v
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {categorias.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoria(null)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                categoria === null
                  ? 'bg-primary-50 border-primary-200 text-primary-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              )}
            >Todas</button>
            {categorias.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(categoria === c ? null : c)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors',
                  categoria === c
                    ? 'bg-primary-50 border-primary-200 text-primary-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                )}
              >{c}</button>
            ))}
          </div>
        )}
      </Card>

      {isLoading ? (
        <LoadingState label="Cargando servicios..." />
      ) : visibles.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package size={22} />}
            title="No hay servicios para mostrar"
            description={busquedaDeb
              ? 'Cambia el término de búsqueda o crea un servicio nuevo.'
              : 'Crea el primer servicio del catálogo.'}
            action={<Button leftIcon={<Plus size={16} />} onClick={abrirCrear}>Nuevo servicio</Button>}
          />
        </Card>
      ) : vista === 'tabla' ? (
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Servicio</TH>
                <TH>Categoría</TH>
                <TH>Precio</TH>
                <TH>Unidad</TH>
                <TH>Estado</TH>
                <TH>Creado por</TH>
                <TH>Última edición</TH>
                <TH>Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {visibles.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'h-9 w-9 rounded-xl flex items-center justify-center ring-1',
                        s.esPersonalizado
                          ? 'bg-warning-50 text-warning-700 ring-warning-100'
                          : 'bg-primary-50 text-primary-700 ring-primary-100'
                      )}>
                        {s.esPersonalizado ? <Star size={16} /> : <Tags size={16} />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950 truncate">{s.nombre}</p>
                        {s.descripcion && (
                          <p className="text-xs text-slate-500 truncate max-w-[280px]">{s.descripcion}</p>
                        )}
                      </div>
                      {s.esPersonalizado && (
                        <Badge tone="warning" outline>Personalizado</Badge>
                      )}
                    </div>
                  </TD>
                  <TD>{s.categoria ?? <span className="text-slate-400">—</span>}</TD>
                  <TD>
                    <span className="num font-semibold text-slate-900">S/ {Number(s.precio).toFixed(2)}</span>
                  </TD>
                  <TD><span className="text-slate-700">{s.unidad}</span></TD>
                  <TD>
                    <Badge tone={s.activo ? 'success' : 'neutral'} dot>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TD>
                  <TD>
                    {s.creadoPor ? (
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <UserRound size={14} className="text-slate-400" /> {s.creadoPor.nombre}
                      </span>
                    ) : <span className="text-slate-400">—</span>}
                    <p className="text-xs text-slate-500 mt-0.5">{fmtFecha(s.createdAt)}</p>
                  </TD>
                  <TD>
                    {s.actualizadoPor ? (
                      <span className="text-slate-700 text-sm">{s.actualizadoPor.nombre}</span>
                    ) : <span className="text-slate-400">—</span>}
                    <p className="text-xs text-slate-500 mt-0.5">{fmtFecha(s.updatedAt)}</p>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => abrirEditar(s)}>
                        Editar
                      </Button>
                      {s.activo ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<PowerOff size={14} />}
                          onClick={() => setADesactivar(s)}
                        >Desactivar</Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          leftIcon={<Power size={14} />}
                          onClick={() => reactivarMutation.mutate(s)}
                          loading={reactivarMutation.isPending && reactivarMutation.variables?.id === s.id}
                        >Reactivar</Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((s) => (
            <Card key={s.id} className="group transition-all hover:-translate-y-0.5 hover:shadow-pop">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className={cn(
                    'h-10 w-10 rounded-xl flex items-center justify-center ring-1',
                    s.esPersonalizado
                      ? 'bg-warning-50 text-warning-700 ring-warning-100'
                      : 'bg-primary-50 text-primary-700 ring-primary-100'
                  )}>
                    {s.esPersonalizado ? <Star size={18} /> : <Tags size={18} />}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={s.activo ? 'success' : 'neutral'} dot>
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </Badge>
                    {s.esPersonalizado && <Badge tone="warning" outline>Personalizado</Badge>}
                  </div>
                </div>
                <p className="mt-4 font-semibold text-slate-950">{s.nombre}</p>
                {s.categoria && <p className="text-xs text-slate-500 mt-0.5">{s.categoria}</p>}
                {s.descripcion && (
                  <p className="text-sm text-slate-600 mt-2 line-clamp-2">{s.descripcion}</p>
                )}
                <p className="num mt-4 text-3xl font-semibold text-primary-700">S/ {Number(s.precio).toFixed(2)}</p>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">Unidad</span>
                  <span className="text-sm font-medium text-slate-900">{s.unidad}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div>
                    <p className="font-medium text-slate-600">Creado</p>
                    <p>{s.creadoPor?.nombre ?? '—'}</p>
                    <p>{fmtFecha(s.createdAt)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-slate-600">Última edición</p>
                    <p>{s.actualizadoPor?.nombre ?? '—'}</p>
                    <p>{fmtFecha(s.updatedAt)}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="secondary" size="sm" block leftIcon={<Pencil size={14} />} onClick={() => abrirEditar(s)}>
                    Editar
                  </Button>
                  {s.activo ? (
                    <Button variant="ghost" size="sm" block leftIcon={<Trash2 size={14} />} onClick={() => setADesactivar(s)}>
                      Desactivar
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" block leftIcon={<Power size={14} />} onClick={() => reactivarMutation.mutate(s)}>
                      Reactivar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ServicioFormModal open={openForm} onClose={cerrarForm} servicio={editando} />

      <ImportarExcelModal
        open={openImport}
        onClose={() => setOpenImport(false)}
        titulo="Importar prendas desde Excel"
        subtitulo="Hoja 'prendas' con: codigo, nombre, categoria, precio_base, abreviaturas, activo."
        endpointImport="/servicios/importar-excel"
        endpointPlantilla="/servicios/plantilla-excel"
        invalidarQueryKeys={[['servicios']]}
      />

      <ConfirmDialog
        open={!!aDesactivar}
        title="Desactivar servicio"
        message={aDesactivar
          ? `¿Seguro que deseas desactivar "${aDesactivar.nombre}"? Los pedidos históricos no se verán afectados. Podrás reactivarlo después.`
          : ''}
        confirmLabel="Desactivar"
        destructive
        loading={desactivarMutation.isPending}
        onCancel={() => setADesactivar(null)}
        onConfirm={() => aDesactivar && desactivarMutation.mutate(aDesactivar.id)}
      />
    </div>
  );
}
