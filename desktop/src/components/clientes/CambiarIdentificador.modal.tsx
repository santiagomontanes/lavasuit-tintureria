import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, History } from 'lucide-react';
import dayjs from 'dayjs';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Field, Input, Textarea } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { useAuthStore } from '../../store/auth.store';

/* Cambio del número/identificador visible de un cliente.  Solo ADMIN.
 *
 * QUÉ CAMBIA: `identificador` y, con él, `ordenBase`, `subOrden`, `sortKey` y
 * el orden del cliente dentro de la ruta de cada empleado. Son la misma cosa
 * vista de dos formas ("280" ≡ ordenBase 280 / subOrden 0), por eso el backend
 * los reescribe juntos.
 *
 * QUÉ NO CAMBIA: el id interno del cliente, sus pedidos históricos y los
 * consecutivos de las órdenes. No se crea ningún cliente nuevo.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  cliente: any | null;
}

export default function CambiarIdentificadorModal({ open, onClose, cliente }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore((s) => s.show);
  const esAdmin = useAuthStore((s) => s.usuario?.rol === 'ADMIN');

  const [identificador, setIdentificador] = useState('');
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIdentificador(cliente?.identificador ?? '');
    setMotivo('');
    setConfirmando(false);
  }, [open, cliente]);

  const { data: historial = [] } = useQuery({
    queryKey: ['cliente-identificador-historial', cliente?.id],
    queryFn:  () => api.get(`/clientes/${cliente.id}/identificador-historial`).then((r) => r.data),
    enabled:  open && !!cliente?.id
  });

  const formatoOk = /^\d+(?:[_.]\d+)?$/.test(identificador.trim());
  const cambio    = identificador.trim() !== (cliente?.identificador ?? '');
  const motivoOk  = motivo.trim().length >= 5;
  const valido    = formatoOk && cambio && motivoOk;

  const impacto = useMemo(() => {
    const m = identificador.trim().match(/^(\d+)(?:[_.](\d+))?$/);
    if (!m) return null;
    return { ordenBase: parseInt(m[1], 10), subOrden: m[2] ? parseInt(m[2], 10) : 0 };
  }, [identificador]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/clientes/${cliente.id}/identificador`, {
        identificador: identificador.trim(),
        motivo: motivo.trim()
      }).then((r) => r.data),
    onSuccess: (data) => {
      toast(`Número actualizado a ${data.identificador}`, 'success');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['rutas'] });
      qc.invalidateQueries({ queryKey: ['cliente-identificador-historial', cliente.id] });
      onClose();
    },
    onError: (e: any) => {
      toast(e?.response?.data?.error || 'No se pudo cambiar el número', 'error');
      setConfirmando(false);
    }
  });

  if (!cliente) return null;

  return (
    <Modal open={open} onClose={onClose} title={`Cambiar número de ${cliente.nombre}`}>
      <div className="space-y-4">
        {!esAdmin && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Solo un administrador puede cambiar el número de un cliente.</span>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <span className="text-sm text-slate-500">Número actual</span>
          <span className="font-mono text-sm font-bold text-slate-900">
            {cliente.identificador ?? 'sin número'}
          </span>
        </div>

        <Field
          label="Nuevo número"
          hint='Formato de ruta: "280" o "280_1" para un cliente intercalado.'
        >
          <Input
            value={identificador}
            onChange={(e) => { setIdentificador(e.target.value); setConfirmando(false); }}
            placeholder="280"
            disabled={!esAdmin || mutation.isPending}
          />
        </Field>
        {identificador.trim() && !formatoOk && (
          <p className="-mt-2 text-xs font-medium text-danger-600">
            Formato inválido. Usa solo dígitos, opcionalmente con "_" y el sub-orden.
          </p>
        )}

        <Field label="Motivo del cambio (obligatorio)">
          <Textarea
            rows={2}
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); setConfirmando(false); }}
            placeholder="Ej: el cliente cambió de posición en la ruta; se corrigió un número duplicado…"
            disabled={!esAdmin || mutation.isPending}
          />
        </Field>
        {motivo.trim().length > 0 && !motivoOk && (
          <p className="-mt-2 text-xs font-medium text-danger-600">Escribe al menos 5 caracteres.</p>
        )}

        {/* Impacto explícito antes de guardar */}
        {impacto && cambio && (
          <div className="rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-800 space-y-1">
            <p className="font-semibold">Qué va a pasar</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>Orden de ruta: base <b>{impacto.ordenBase}</b>, sub-orden <b>{impacto.subOrden}</b>.</li>
              <li>Se actualiza la posición del cliente en la ruta de cada empleado.</li>
              <li>Los pedidos históricos y sus consecutivos <b>no cambian</b>.</li>
              <li>Mobile recibe el nuevo código al sincronizar.</li>
            </ul>
          </div>
        )}

        {historial.length > 0 && (
          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <History size={14} className="text-slate-400" />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Cambios anteriores
              </span>
              <Badge tone="neutral" outline>{historial.length}</Badge>
            </div>
            <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto">
              {historial.map((h: any) => (
                <li key={h.id} className="px-3 py-2 text-sm">
                  <p className="font-mono font-semibold text-slate-900">
                    {h.identificadorAnterior ?? '—'} → {h.identificadorNuevo ?? '—'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {h.usuario?.nombre ?? '—'} · {dayjs(h.createdAt).format('DD/MM/YYYY HH:mm')}
                  </p>
                  <p className="text-xs text-slate-600">{h.motivo}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {confirmando && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Vas a cambiar el número de <b>{cliente.nombre}</b> de{' '}
              <b>{cliente.identificador ?? 'sin número'}</b> a <b>{identificador.trim()}</b>.
              Queda registrado en la auditoría. ¿Confirmas?
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          {confirmando ? (
            <Button
              onClick={() => mutation.mutate()}
              disabled={!valido || !esAdmin || mutation.isPending}
            >
              {mutation.isPending ? 'Guardando…' : 'Sí, cambiar número'}
            </Button>
          ) : (
            <Button onClick={() => setConfirmando(true)} disabled={!valido || !esAdmin}>
              Cambiar número
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
