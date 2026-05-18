import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge, { PEDIDO_ESTADO_LABEL, PEDIDO_ESTADO_TONE } from '../ui/Badge';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';
import { cn } from '../../lib/cn';

const ESTADOS = ['RECIBIDO', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'] as const;
type Estado = typeof ESTADOS[number];

interface Props {
  open:           boolean;
  onClose:        () => void;
  pedidoId:       string;
  estadoActual:   Estado | string;
}

export default function CambiarEstadoModal({ open, onClose, pedidoId, estadoActual }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [estado, setEstado] = useState<Estado>(estadoActual as Estado);

  useEffect(() => {
    if (open) setEstado(estadoActual as Estado);
  }, [open, estadoActual]);

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/pedidos/${pedidoId}/estado`, { estado }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedidos'] });
      qc.invalidateQueries({ queryKey: ['pedido', pedidoId] });
      qc.invalidateQueries({ queryKey: ['reportes'] });
      toast.show(`Estado actualizado a ${estado}`, 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo cambiar el estado';
      toast.show(msg, 'error');
    }
  });

  return (
    <Modal open={open} onClose={onClose} title="Cambiar estado del pedido" subtitle="Selecciona el nuevo avance operativo." size="sm">
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setEstado(e)}
              className={cn(
                'flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors focus-ring',
                estado === e
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-primary-50 hover:border-primary-200'
              )}
            >
              <span>{PEDIDO_ESTADO_LABEL[e]}</span>
              <Badge dot tone={PEDIDO_ESTADO_TONE[e]} className={estado === e ? 'bg-white/10 text-white' : ''}>
                {e}
              </Badge>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={estado === estadoActual || mutation.isPending}
            loading={mutation.isPending}
          >
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
