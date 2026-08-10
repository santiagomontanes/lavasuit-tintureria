import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Upload, Route, Users, FileSpreadsheet, CheckCircle2, AlertTriangle, Search
} from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Table, TableContainer, TBody, TD, TH, THead, TR } from '../components/ui/Table';
import { Field, Input, Select, inputClassName } from '../components/ui/Input';
import { useToastStore } from '../store/toast.store';
import { cn } from '../lib/cn';
import { leerExcelClientes, FilaExcel, COLUMNAS_REQUERIDAS } from '../lib/excel';
import { parseOrden, formatIdentificador } from '../lib/orden';
import { filtrarClientes } from '../lib/busquedaClientes';

/* ─────────────────────────  Tipos  ───────────────────────── */

interface Empleado { id: string; nombre: string; email: string; rol: string; activo: boolean; }
interface RutaAsignacion { id: string; usuarioId: string; usuario: { id: string; nombre: string; rol: string }; }
interface ClienteRow {
  id: string; nombre: string; telefono: string; identificador: string | null;
  ordenBase: number | null; subOrden: number; asignadoAId: string | null;
  asignadoA?: { id: string; nombre: string } | null;
  rutas?: { id: string; usuario: { id: string; nombre: string; rol: string } }[];
}
interface RutaResumen {
  usuarioId: string; nombre: string; email: string; rol: string;
  totalClientes: number; ordenMin: number | null; ordenMax: number | null;
}
interface ImportResumen { total: number; nuevos: number; actualizados: number; duplicados: number; errores: number; }
interface ImportError { fila: number; motivo: string; }

type EstadoFila = 'ok' | 'duplicada' | 'error';
interface FilaPreview extends FilaExcel { _estado: EstadoFila; _motivo?: string; }

/* ─────────────────────────  Validación de preview  ───────────────────────── */

const validarFilas = (filas: FilaExcel[]): FilaPreview[] => {
  const tel = new Set<string>();
  const ident = new Set<string>();
  const ordenes = new Set<string>();

  return filas.map((f) => {
    const nombre = f.nombre_cliente.trim();
    const telefono = f.numero_celular.trim();
    if (!nombre || telefono.length < 6) {
      return { ...f, _estado: 'error', _motivo: 'Falta nombre o número de celular válido' };
    }
    const { ordenBase, subOrden } = parseOrden(f.orden, f.identificador_cliente);
    const ordenClave = ordenBase != null ? `${ordenBase}_${subOrden}` : '';
    if (
      tel.has(telefono) ||
      (f.identificador_cliente && ident.has(f.identificador_cliente)) ||
      (ordenClave && ordenes.has(ordenClave))
    ) {
      return { ...f, _estado: 'duplicada', _motivo: 'Repetida dentro del archivo' };
    }
    tel.add(telefono);
    if (f.identificador_cliente) ident.add(f.identificador_cliente);
    if (ordenClave) ordenes.add(ordenClave);
    return { ...f, _estado: 'ok' };
  });
};

/* ─────────────────────────  Sección: Importar Excel  ───────────────────────── */

function ImportarExcelCard() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [nombreArchivo, setNombreArchivo] = useState('');
  const [preview, setPreview] = useState<FilaPreview[]>([]);
  const [columnasFaltantes, setColumnasFaltantes] = useState<string[]>([]);
  const [resumen, setResumen] = useState<ImportResumen | null>(null);
  const [erroresServidor, setErroresServidor] = useState<ImportError[]>([]);
  const [leyendo, setLeyendo] = useState(false);

  const conteo = useMemo(() => ({
    ok:        preview.filter((f) => f._estado === 'ok').length,
    duplicada: preview.filter((f) => f._estado === 'duplicada').length,
    error:     preview.filter((f) => f._estado === 'error').length
  }), [preview]);

  const importar = useMutation({
    mutationFn: async () => {
      const filas = preview.map((f) => ({
        identificador_cliente: f.identificador_cliente,
        nombre_cliente:        f.nombre_cliente,
        numero_celular:        f.numero_celular,
        direccion:             f.direccion,
        orden:                 f.orden
      }));
      const { data } = await api.post('/clientes/importar-excel', { filas });
      return data as { resumen: ImportResumen; errores: ImportError[] };
    },
    onSuccess: (data) => {
      setResumen(data.resumen);
      setErroresServidor(data.errores ?? []);
      toast(`Importación: ${data.resumen.nuevos} nuevos, ${data.resumen.actualizados} actualizados`, 'success');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['rutas'] });
    },
    onError: (e: any) => {
      toast(e?.response?.data?.error || 'No se pudo importar el Excel', 'error');
    }
  });

  const onArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLeyendo(true);
    setResumen(null);
    setErroresServidor([]);
    try {
      const { filas, columnasFaltantes } = await leerExcelClientes(file);
      setNombreArchivo(file.name);
      setColumnasFaltantes(columnasFaltantes);
      setPreview(validarFilas(filas));
    } catch {
      toast('No se pudo leer el archivo. ¿Es un Excel válido?', 'error');
      setPreview([]);
      setNombreArchivo('');
    } finally {
      setLeyendo(false);
    }
  };

  const limpiar = () => {
    setPreview([]);
    setNombreArchivo('');
    setColumnasFaltantes([]);
    setResumen(null);
    setErroresServidor([]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const puedeImportar = preview.length > 0 && columnasFaltantes.length === 0 && conteo.ok + conteo.duplicada > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-primary-600" />
            Importar clientes desde Excel
          </span>
        </CardTitle>
        {nombreArchivo && (
          <Button variant="ghost" size="sm" onClick={limpiar}>Limpiar</Button>
        )}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-slate-600">
          El archivo debe contener las columnas:{' '}
          <span className="font-medium text-slate-800">{COLUMNAS_REQUERIDAS.join(', ')}</span>.
        </p>

        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={onArchivo}
            className="hidden"
            id="excel-input"
          />
          <label htmlFor="excel-input">
            <span className={cn(
              'inline-flex items-center gap-2 h-9 px-4 text-sm font-medium rounded-lg cursor-pointer',
              'bg-white border border-slate-200 shadow-sm hover:bg-slate-50'
            )}>
              <Upload size={16} /> Seleccionar archivo
            </span>
          </label>
          {leyendo && <span className="text-sm text-slate-500">Leyendo…</span>}
          {nombreArchivo && !leyendo && (
            <span className="text-sm text-slate-700">{nombreArchivo}</span>
          )}
        </div>

        {columnasFaltantes.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg bg-danger-50 border border-danger-200 px-3 py-2 text-sm text-danger-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Faltan columnas obligatorias: <b>{columnasFaltantes.join(', ')}</b></span>
          </div>
        )}

        {preview.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success" outline>{conteo.ok} válidas</Badge>
              <Badge tone="warning" outline>{conteo.duplicada} duplicadas</Badge>
              <Badge tone="danger" outline>{conteo.error} con error</Badge>
              <Badge tone="neutral" outline>{preview.length} filas en total</Badge>
            </div>

            <TableContainer>
              <Table>
                <THead>
                  <TR>
                    <TH>Identificador</TH>
                    <TH>Nombre</TH>
                    <TH>Celular</TH>
                    <TH>Dirección</TH>
                    <TH>Orden</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {preview.slice(0, 100).map((f, i) => {
                    const { ordenBase, subOrden } = parseOrden(f.orden, f.identificador_cliente);
                    const idVisible = f.identificador_cliente || formatIdentificador(ordenBase, subOrden) || '—';
                    return (
                      <TR key={i}>
                        <TD><span className="font-mono text-xs">{idVisible}</span></TD>
                        <TD className="font-medium text-slate-900">{f.nombre_cliente || '—'}</TD>
                        <TD>{f.numero_celular || '—'}</TD>
                        <TD className="text-slate-500">{f.direccion || '—'}</TD>
                        <TD>{f.orden || '—'}</TD>
                        <TD>
                          {f._estado === 'ok' && <Badge tone="success" dot>Válida</Badge>}
                          {f._estado === 'duplicada' && <Badge tone="warning" dot title={f._motivo}>Duplicada</Badge>}
                          {f._estado === 'error' && <Badge tone="danger" dot title={f._motivo}>Error</Badge>}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableContainer>
            {preview.length > 100 && (
              <p className="text-xs text-slate-500">Mostrando las primeras 100 filas de {preview.length}.</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                leftIcon={<Upload size={16} />}
                disabled={!puedeImportar}
                loading={importar.isPending}
                onClick={() => importar.mutate()}
              >
                Importar a base central
              </Button>
              <span className="text-xs text-slate-500">
                Las filas con error se omiten. Las duplicadas dentro del archivo no se reenvían.
              </span>
            </div>
          </>
        )}

        {resumen && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <CheckCircle2 size={16} className="text-success-600" /> Resumen de importación
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {([
                ['Total', resumen.total, 'neutral'],
                ['Nuevos', resumen.nuevos, 'success'],
                ['Actualizados', resumen.actualizados, 'info'],
                ['Duplicados', resumen.duplicados, 'warning'],
                ['Errores', resumen.errores, 'danger']
              ] as const).map(([label, val, tone]) => (
                <div key={label} className="rounded-lg bg-white border border-slate-200 px-3 py-2">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={cn(
                    'text-lg font-bold',
                    tone === 'success' && 'text-success-700',
                    tone === 'danger' && 'text-danger-700',
                    tone === 'warning' && 'text-warning-700',
                    tone === 'info' && 'text-info-700',
                    tone === 'neutral' && 'text-slate-900'
                  )}>{val}</p>
                </div>
              ))}
            </div>
            {erroresServidor.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-danger-700">Detalle de errores:</p>
                <ul className="text-xs text-slate-600 space-y-0.5 max-h-40 overflow-y-auto">
                  {erroresServidor.map((e, i) => (
                    <li key={i}>Fila {e.fila}: {e.motivo}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────  Sección: Asignar a empleado  ───────────────────────── */

function AsignarCard({ empleados, clientes }: { empleados: Empleado[]; clientes: ClienteRow[] }) {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const [usuarioId, setUsuarioId] = useState('');
  const [modo, setModo] = useState<'rango' | 'especificos'>('rango');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  // Regla única: número → código, letras → nombre. Nunca teléfono.
  const clientesFiltrados = useMemo(
    () => filtrarClientes(clientes, busqueda).slice(0, 200),
    [clientes, busqueda]
  );

  const asignar = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { usuarioId };
      if (modo === 'rango') {
        body.desde = Number(desde);
        body.hasta = Number(hasta);
      } else {
        body.clienteIds = Array.from(seleccion);
      }
      const { data } = await api.post('/clientes/asignar', body);
      return data as { asignados: number; procesados: number; empleado: string };
    },
    onSuccess: (data) => {
      // El conteo viene del backend (clientes realmente asignados), no de un
      // cálculo aproximado del rango en el frontend.
      const { asignados, procesados, empleado } = data;
      const mensaje = procesados > asignados
        ? `${procesados} clientes procesados, ${asignados} en la ruta de ${empleado}`
        : `${asignados} ${asignados === 1 ? 'cliente agregado' : 'clientes agregados'} a la ruta de ${empleado}`;
      toast(mensaje, 'success');
      setSeleccion(new Set());
      qc.invalidateQueries({ queryKey: ['rutas'] });
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (e: any) => {
      toast(e?.response?.data?.error || 'No se pudo asignar', 'error');
    }
  });

  const toggleCliente = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const puedeAsignar =
    !!usuarioId &&
    (modo === 'rango'
      ? desde !== '' && hasta !== '' && Number(desde) <= Number(hasta)
      : seleccion.size > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Users size={16} className="text-primary-600" />
            Asignar clientes a un empleado
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Empleado">
            <Select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
              <option value="">Selecciona un empleado…</option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>
              ))}
            </Select>
          </Field>

          <Field label="Modo de asignación">
            <div className="flex gap-2">
              <Button
                variant={modo === 'rango' ? 'primary' : 'secondary'}
                size="md"
                onClick={() => setModo('rango')}
              >
                Por rango
              </Button>
              <Button
                variant={modo === 'especificos' ? 'primary' : 'secondary'}
                size="md"
                onClick={() => setModo('especificos')}
              >
                Clientes específicos
              </Button>
            </div>
          </Field>
        </div>

        {modo === 'rango' ? (
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <Field label="Desde (orden base)" hint="Ej. 1">
              <Input type="number" value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="1" />
            </Field>
            <Field label="Hasta (orden base)" hint="Ej. 60">
              <Input type="number" value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="60" />
            </Field>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o código"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className={cn(inputClassName, 'pl-9')}
              />
            </div>
            <div className="border border-slate-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
              {clientesFiltrados.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-400">Sin clientes que coincidan.</p>
              ) : clientesFiltrados.map((c) => (
                <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccion.has(c.id)}
                    onChange={() => toggleCliente(c.id)}
                    className="rounded border-slate-300"
                  />
                  <span className="font-mono text-xs text-slate-500 w-14">{c.identificador ?? '—'}</span>
                  <span className="flex-1 text-sm text-slate-800">{c.nombre}</span>
                  <span className="text-xs text-slate-400">{c.telefono}</span>
                  {(c.rutas && c.rutas.length > 0)
                    ? <Badge tone="success" outline>{c.rutas.length} empleado{c.rutas.length === 1 ? '' : 's'}</Badge>
                    : c.asignadoA && <Badge tone="neutral" outline>{c.asignadoA.nombre}</Badge>}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">{seleccion.size} clientes seleccionados.</p>
          </div>
        )}

        <Button
          disabled={!puedeAsignar}
          loading={asignar.isPending}
          onClick={() => asignar.mutate()}
        >
          Asignar a empleado
        </Button>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────  Sección: Asignaciones por cliente  ───────────── */

function AsignacionesPorClienteCard({ empleados, clientes }: { empleados: Empleado[]; clientes: ClienteRow[] }) {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();

  const [busqueda, setBusqueda] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [nuevoEmpleado, setNuevoEmpleado] = useState('');

  const clienteSel = useMemo(() => clientes.find((c) => c.id === clienteId) ?? null, [clientes, clienteId]);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    return filtrarClientes(clientes, busqueda).slice(0, 20);
  }, [clientes, busqueda]);

  const { data: asignaciones = [], refetch } = useQuery({
    queryKey: ['cliente-asignaciones', clienteId],
    queryFn:  () => api.get(`/clientes/${clienteId}/asignaciones`).then((r) => r.data as RutaAsignacion[]),
    enabled:  !!clienteId
  });

  const refrescar = () => {
    refetch();
    qc.invalidateQueries({ queryKey: ['rutas'] });
    qc.invalidateQueries({ queryKey: ['clientes'] });
  };

  const agregar = useMutation({
    mutationFn: () => api.post(`/clientes/${clienteId}/asignaciones`, { usuarioIds: [nuevoEmpleado] }).then((r) => r.data),
    onSuccess: () => { toast('Empleado agregado a la ruta', 'success'); setNuevoEmpleado(''); refrescar(); },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo agregar', 'error')
  });

  const quitar = useMutation({
    mutationFn: (usuarioId: string) => api.delete(`/clientes/${clienteId}/asignaciones/${usuarioId}`).then((r) => r.data),
    onSuccess: () => { toast('Empleado quitado de la ruta', 'success'); refrescar(); },
    onError: (e: any) => toast(e?.response?.data?.error || 'No se pudo quitar', 'error')
  });

  const yaAsignados = new Set(asignaciones.map((a) => a.usuarioId));
  const disponibles = empleados.filter((e) => !yaAsignados.has(e.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Users size={16} className="text-primary-600" />
            Asignaciones por cliente (varios empleados)
          </span>
        </CardTitle>
        {clienteSel && <Badge tone="info" outline>{asignaciones.length} empleado{asignaciones.length === 1 ? '' : 's'}</Badge>}
      </CardHeader>
      <CardBody className="space-y-4">
        <p className="text-sm text-slate-600">
          Un mismo cliente puede pertenecer a la ruta de varios empleados a la vez. Agregar o quitar
          uno <b>no afecta</b> a los demás.
        </p>

        {/* Buscar / elegir cliente */}
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o código"
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setClienteId(''); }}
            className={cn(inputClassName, 'pl-9')}
          />
        </div>
        {busqueda.trim() && !clienteId && (
          <div className="border border-slate-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-slate-100 max-w-md">
            {resultados.length === 0
              ? <p className="px-3 py-4 text-sm text-slate-400">Sin clientes que coincidan.</p>
              : resultados.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setClienteId(c.id); setBusqueda(`${c.identificador ?? ''} ${c.nombre}`.trim()); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <span className="font-mono text-xs text-slate-500 w-14">{c.identificador ?? '—'}</span>
                  <span className="flex-1 text-sm text-slate-800">{c.nombre}</span>
                  {c.rutas && c.rutas.length > 0 && <Badge tone="success" outline>{c.rutas.length}</Badge>}
                </button>
              ))}
          </div>
        )}

        {clienteSel && (
          <div className="rounded-lg border border-slate-200 p-4 space-y-3 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{clienteSel.identificador ?? '—'}</span>
              <span className="font-semibold text-slate-900">{clienteSel.nombre}</span>
              <button className="ml-auto text-xs text-slate-400 hover:text-slate-600" onClick={() => { setClienteId(''); setBusqueda(''); }}>
                cambiar
              </button>
            </div>

            {/* Chips de empleados asignados */}
            <div className="flex flex-wrap gap-2">
              {asignaciones.length === 0
                ? <span className="text-sm text-slate-400">Sin empleados asignados todavía.</span>
                : asignaciones.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-200 pl-3 pr-1.5 py-1 text-sm text-primary-800">
                    {a.usuario?.nombre ?? a.usuarioId}
                    <button
                      onClick={() => quitar.mutate(a.usuarioId)}
                      disabled={quitar.isPending}
                      className="rounded-full hover:bg-primary-200 w-5 h-5 inline-flex items-center justify-center text-primary-700"
                      title="Quitar de la ruta"
                    >×</button>
                  </span>
                ))}
            </div>

            {/* Agregar empleado */}
            <div className="flex items-end gap-2">
              <div className="flex-1 max-w-xs">
                <Field label="Agregar empleado">
                  <Select value={nuevoEmpleado} onChange={(e) => setNuevoEmpleado(e.target.value)}>
                    <option value="">Selecciona un empleado…</option>
                    {disponibles.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.rol})</option>)}
                  </Select>
                </Field>
              </div>
              <Button disabled={!nuevoEmpleado} loading={agregar.isPending} onClick={() => agregar.mutate()}>
                Agregar empleado
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────  Sección: Rutas actuales  ───────────────────────── */

function RutasActualesCard({ rutas }: { rutas: RutaResumen[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2">
            <Route size={16} className="text-primary-600" />
            Rutas actuales por empleado
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <TableContainer>
          <Table>
            <THead>
              <TR>
                <TH>Empleado</TH>
                <TH>Rol</TH>
                <TH align="center">Clientes asignados</TH>
                <TH align="center">Rango de orden</TH>
              </TR>
            </THead>
            <TBody>
              {rutas.map((r) => (
                <TR key={r.usuarioId}>
                  <TD className="font-medium text-slate-900">{r.nombre}</TD>
                  <TD><Badge tone="neutral" outline>{r.rol}</Badge></TD>
                  <TD align="center">
                    <Badge tone={r.totalClientes > 0 ? 'success' : 'neutral'} outline>
                      {r.totalClientes}
                    </Badge>
                  </TD>
                  <TD align="center" className="text-slate-600">
                    {r.ordenMin != null && r.ordenMax != null
                      ? `${r.ordenMin} – ${r.ordenMax}`
                      : '—'}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      </CardBody>
    </Card>
  );
}

/* ─────────────────────────  Página  ───────────────────────── */

export default function RutasPage() {
  const { data: empleados = [] } = useQuery({
    queryKey: ['empleados'],
    queryFn: async () => {
      const { data } = await api.get('/empleados');
      return data as Empleado[];
    }
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', ''],
    queryFn: async () => {
      const { data } = await api.get('/clientes');
      return data as ClienteRow[];
    }
  });

  const { data: rutas = [] } = useQuery({
    queryKey: ['rutas'],
    queryFn: async () => {
      const { data } = await api.get('/rutas');
      return data as RutaResumen[];
    }
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operación"
        title="Rutas y asignaciones"
        description="Importa la base de clientes desde Excel y asigna grupos de clientes a cada empleado."
        meta={<Badge tone="info" outline>{clientes.length} clientes en base central</Badge>}
      />

      <ImportarExcelCard />
      <AsignacionesPorClienteCard empleados={empleados} clientes={clientes} />
      <AsignarCard empleados={empleados} clientes={clientes} />
      <RutasActualesCard rutas={rutas} />
    </div>
  );
}
