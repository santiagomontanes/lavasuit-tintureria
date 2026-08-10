import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../ui/Modal';
import { Field, Input, Select, Textarea } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { formatCurrencyCOP } from '../../lib/currency';

interface Props {
  open:    boolean;
  onClose: () => void;
  gasto?:  any | null;
}

export const CATEGORIAS_GASTO = [
  'Arriendo', 'Servicios públicos', 'Nómina', 'Insumos', 'Bolsas',
  'Detergentes', 'Transporte', 'Mantenimiento', 'Otros'
];

const METODOS = ['EFECTIVO', 'NEQUI', 'DAVIPLATA', 'TRANSFERENCIA', 'TARJETA', 'OTRO'];

const hoy = () => new Date().toISOString().slice(0, 10);

const inicial = { concepto: '', categoria: '', valor: '', fecha: hoy(), metodoPago: '', descripcion: '' };

export default function GastoFormModal({ open, onClose, gasto }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const esEdicion = !!gasto?.id;

  const [form, setForm] = useState(inicial);

  useEffect(() => {
    if (!open) return;
    if (esEdicion) {
      setForm({
        concepto:    gasto.concepto ?? '',
        categoria:   gasto.categoria ?? '',
        valor:       String(gasto.valor ?? ''),
        fecha:       gasto.fecha ? String(gasto.fecha).slice(0, 10) : hoy(),
        metodoPago:  gasto.metodoPago ?? '',
        descripcion: gasto.descripcion ?? ''
      });
    } else {
      setForm(inicial);
    }
  }, [open, esEdicion, gasto]);

  const valorNum = Number(String(form.valor).replace(',', '.'));
  const errConcepto  = form.concepto.trim().length === 0;
  const errCategoria = form.categoria.trim().length === 0;
  const errValor     = !Number.isFinite(valorNum) || valorNum <= 0;
  const invalido = errConcepto || errCategoria || errValor;

  // Caja Disponible = Ingresos del día - Gastos del día (punto 6). Sólo
  // informativo: nunca bloquea el registro del gasto. El flag
  // `descontarGastosDeCaja` controla si se restan los gastos.
  const cajaQ = useQuery({
    queryKey: ['cierre-dia', 'gasto-form'],
    queryFn:  () => api.get('/reportes/cierre-dia').then((r) => r.data),
    enabled:  open
  });
  const configQ = useQuery({
    queryKey: ['configuracion-empresa'],
    queryFn:  () => api.get('/configuracion/empresa').then((r) => r.data),
    enabled:  open
  });
  const descontarGastos = configQ.data?.descontarGastosDeCaja ?? true;
  const ingresosDia = Number(cajaQ.data?.totalRecibido ?? 0);
  const gastosDia   = Number(cajaQ.data?.totalGastos ?? 0);
  const cajaDisponible = descontarGastos ? ingresosDia - gastosDia : ingresosDia;
  // Al registrar un gasto nuevo descontaría de la caja disponible.
  const excedeCaja = !esEdicion && Number.isFinite(valorNum) && valorNum > 0 && valorNum > cajaDisponible;

  const mutation = useMutation({
    mutationFn: (data: any) =>
      esEdicion
        ? api.patch(`/gastos/${gasto.id}`, data).then((r) => r.data)
        : api.post('/gastos', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gastos'] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show(esEdicion ? 'Gasto actualizado' : 'Gasto registrado', 'success');
      onClose();
    },
    onError: (e: any) => {
      toast.show(e?.response?.data?.error || (esEdicion ? 'No se pudo actualizar' : 'No se pudo registrar'), 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (invalido) return;
    mutation.mutate({
      concepto:    form.concepto.trim(),
      categoria:   form.categoria.trim(),
      valor:       valorNum,
      fecha:       form.fecha || undefined,
      metodoPago:  form.metodoPago || undefined,
      descripcion: form.descripcion.trim() || undefined
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={esEdicion ? 'Editar gasto' : 'Nuevo gasto'} size="sm">
      <form onSubmit={submit} className="p-6 space-y-4">
        <Field label="Concepto *">
          <Input
            value={form.concepto}
            onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))}
            placeholder="Ej: Pago arriendo local"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría *">
            <Input
              list="categorias-gasto"
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              placeholder="Insumos, Nómina…"
            />
            <datalist id="categorias-gasto">
              {CATEGORIAS_GASTO.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="Valor (COP) *">
            <Input
              type="number" min={0} step="any"
              value={form.valor}
              onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))}
              placeholder="20000"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Fecha">
            <Input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
          </Field>
          <Field label="Método de pago">
            <Select value={form.metodoPago} onChange={(e) => setForm((f) => ({ ...f, metodoPago: e.target.value }))}>
              <option value="">— Opcional —</option>
              {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="Descripción (opcional)">
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            rows={2}
            placeholder="Detalle adicional…"
          />
        </Field>

        {!esEdicion && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">
                Caja disponible ({descontarGastos ? 'ingresos − gastos' : 'ingresos'} del día)
              </span>
              <span className={`font-bold ${cajaDisponible < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                {formatCurrencyCOP(cajaDisponible)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Gastos registrados hoy</span>
              <span>{formatCurrencyCOP(gastosDia)}</span>
            </div>
          </div>
        )}

        {excedeCaja && (
          <div className="rounded-lg bg-amber-50 border border-amber-300 px-3 py-2.5 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle size={15} /> Advertencia: la caja actual no tiene fondos suficientes para cubrir este gasto.
            </div>
            <p className="mt-1 text-xs">Origen sugerido (solo informativo): Caja principal · Administrador · Crédito interno.</p>
            <p className="mt-1 text-xs text-amber-700">Puede registrar el gasto de todas formas.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={mutation.isPending}
            className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancelar
          </button>
          <button type="submit" disabled={invalido || mutation.isPending}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {esEdicion ? 'Guardar cambios' : 'Registrar gasto'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
