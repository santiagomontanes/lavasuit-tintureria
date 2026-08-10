import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { Plus, Pencil, Trash2, FileSpreadsheet, Wallet, CalendarDays, Receipt } from 'lucide-react';
import api from '../services/api';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, TableContainer, THead, TH, TBody, TR, TD } from '../components/ui/Table';
import { Field, Input, Select } from '../components/ui/Input';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import GastoFormModal, { CATEGORIAS_GASTO } from '../components/forms/GastoForm.modal';
import { useToastStore } from '../store/toast.store';
import { formatCurrencyCOP } from '../lib/currency';

const moneda = formatCurrencyCOP;
const hoy = () => dayjs().format('YYYY-MM-DD');
const inicioMes = () => dayjs().startOf('month').format('YYYY-MM-DD');

export default function GastosPage() {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [desde, setDesde] = useState(inicioMes());
  const [hasta, setHasta] = useState(hoy());
  const [categoria, setCategoria] = useState('');
  const [openForm, setOpenForm] = useState(false);
  const [editando, setEditando] = useState<any | null>(null);
  const [aEliminar, setAEliminar] = useState<any | null>(null);

  const params = {
    fechaInicio: desde,
    fechaFin:    hasta,
    categoria:   categoria || undefined
  };

  const gastosQ = useQuery({
    queryKey: ['gastos', desde, hasta, categoria],
    queryFn:  () => api.get('/gastos', { params }).then((r) => r.data)
  });

  const hoyQ = useQuery({
    queryKey: ['gastos', 'hoy', hoy()],
    queryFn:  () => api.get('/gastos', { params: { fechaInicio: hoy(), fechaFin: hoy() } }).then((r) => r.data)
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/gastos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show('Gasto eliminado', 'success');
      setAEliminar(null);
    },
    onError: (e: any) => toast.show(e?.response?.data?.error || 'No se pudo eliminar', 'error')
  });

  const gastos: any[] = gastosQ.data?.gastos ?? [];
  const totalPeriodo = Number(gastosQ.data?.total ?? 0);
  const totalHoy = Number(hoyQ.data?.total ?? 0);

  const porCategoria = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of gastos) m[g.categoria] = (m[g.categoria] ?? 0) + Number(g.valor);
    return Object.entries(m).map(([k, v]) => ({ categoria: k, valor: v })).sort((a, b) => b.valor - a.valor);
  }, [gastos]);

  const porMetodo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const g of gastos) {
      const k = g.metodoPago || 'Sin método';
      m[k] = (m[k] ?? 0) + Number(g.valor);
    }
    return Object.entries(m).map(([k, v]) => ({ metodo: k, valor: v })).sort((a, b) => b.valor - a.valor);
  }, [gastos]);

  const exportarExcel = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gastos.map((g) => ({
      Fecha:     dayjs(g.fecha).format('DD/MM/YYYY HH:mm'),
      Concepto:  g.concepto,
      Categoria: g.categoria,
      Metodo:    g.metodoPago ?? '',
      Valor:     Number(g.valor),
      Registrado: g.creadoPor?.nombre ?? '',
      Rol:        g.creadoPor?.rol ?? ''
    }))), 'Gastos');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
      porCategoria.map((c) => ({ Categoria: c.categoria, Valor: c.valor }))
    ), 'Por categoria');
    XLSX.writeFile(wb, `gastos-lavasuit-${desde}_${hasta}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contabilidad"
        title="Gastos del negocio"
        description="Registra y controla los gastos para calcular la utilidad. Filtra por fecha y categoría."
        actions={(
          <div className="flex items-end gap-2">
            <Field label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
            <Field label="Hasta"><Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></Field>
            <Field label="Categoría">
              <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-44">
                <option value="">Todas</option>
                {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Button variant="secondary" leftIcon={<FileSpreadsheet size={15} />} onClick={exportarExcel}>Excel</Button>
            <Button leftIcon={<Plus size={15} />} onClick={() => { setEditando(null); setOpenForm(true); }}>Nuevo gasto</Button>
          </div>
        )}
      />

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard tone="warning" label="Total gastos hoy" value={moneda(totalHoy)}
          hint={dayjs().format('DD/MM/YYYY')} icon={<CalendarDays size={18} />} />
        <StatCard tone="primary" label="Total gastos período" value={moneda(totalPeriodo)}
          hint={`${dayjs(desde).format('DD/MM')} - ${dayjs(hasta).format('DD/MM')}`} icon={<Wallet size={18} />} />
        <StatCard tone="info" label="Cantidad de gastos" value={Number(gastosQ.data?.cantidad ?? 0)}
          hint="En el período" icon={<Receipt size={18} />} />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Gastos por categoría</CardTitle></CardHeader>
          {porCategoria.length === 0 ? (
            <EmptyState compact title="Sin gastos en el período" />
          ) : (
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Categoría</TH><TH align="right">Total</TH></TR></THead>
                <TBody>
                  {porCategoria.map((c) => (
                    <TR key={c.categoria}>
                      <TD className="font-medium text-slate-900">{c.categoria}</TD>
                      <TD align="right" className="num font-semibold">{moneda(c.valor)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Gastos por método de pago</CardTitle></CardHeader>
          {porMetodo.length === 0 ? (
            <EmptyState compact title="Sin gastos en el período" />
          ) : (
            <TableContainer className="border-0 shadow-none rounded-none">
              <Table>
                <THead><TR><TH>Método</TH><TH align="right">Total</TH></TR></THead>
                <TBody>
                  {porMetodo.map((m) => (
                    <TR key={m.metodo}>
                      <TD className="font-medium text-slate-900">{m.metodo}</TD>
                      <TD align="right" className="num font-semibold">{moneda(m.valor)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          )}
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Detalle de gastos</CardTitle></CardHeader>
        {gastosQ.isLoading ? (
          <LoadingState label="Cargando gastos..." className="border-0 shadow-none rounded-none" />
        ) : gastos.length === 0 ? (
          <EmptyState title="No hay gastos" description="Registra el primer gasto del período." compact />
        ) : (
          <TableContainer className="border-0 shadow-none rounded-none">
            <Table>
              <THead>
                <TR>
                  <TH>Fecha y hora</TH><TH>Concepto</TH><TH>Categoría</TH><TH>Método</TH>
                  <TH>Registrado por</TH>
                  <TH align="right">Valor</TH><TH align="right">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {gastos.map((g) => (
                  <TR key={g.id}>
                    <TD className="text-slate-600">{dayjs(g.fecha).format('DD/MM/YYYY HH:mm')}</TD>
                    <TD>
                      <p className="font-medium text-slate-900">{g.concepto}</p>
                      {g.descripcion && <p className="text-xs text-slate-500">{g.descripcion}</p>}
                    </TD>
                    <TD>{g.categoria}</TD>
                    <TD className="text-slate-600">{g.metodoPago ?? '—'}</TD>
                    <TD className="text-slate-700">
                      {g.creadoPor?.nombre
                        ? <>{g.creadoPor.nombre}{g.creadoPor.rol ? <span className="text-slate-400"> ({g.creadoPor.rol})</span> : null}</>
                        : <span className="text-slate-400">—</span>}
                    </TD>
                    <TD align="right" className="num font-semibold text-slate-900">{moneda(Number(g.valor))}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => { setEditando(g); setOpenForm(true); }}
                          className="p-1.5 text-slate-500 hover:text-blue-600" title="Editar"><Pencil size={15} /></button>
                        <button onClick={() => setAEliminar(g)}
                          className="p-1.5 text-slate-500 hover:text-red-600" title="Eliminar"><Trash2 size={15} /></button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      <GastoFormModal open={openForm} onClose={() => setOpenForm(false)} gasto={editando} />
      <ConfirmDialog
        open={!!aEliminar}
        title="Eliminar gasto"
        message={`¿Eliminar el gasto "${aEliminar?.concepto ?? ''}" por ${moneda(Number(aEliminar?.valor ?? 0))}?`}
        destructive
        confirmLabel="Eliminar"
        loading={eliminar.isPending}
        onCancel={() => setAEliminar(null)}
        onConfirm={() => aEliminar && eliminar.mutate(aEliminar.id)}
      />
    </div>
  );
}
