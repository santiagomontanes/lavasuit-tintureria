import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import api from '../../services/api';
import Button from '../ui/Button';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/Card';
import { Field, Input } from '../ui/Input';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useToastStore } from '../../store/toast.store';

const FRASE = 'RESTABLECER OPERACION';

export default function RestablecerOperacion() {
  const toast = useToastStore((s) => s.show);
  const qc = useQueryClient();
  const [frase, setFrase] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const coincide = frase.trim().toUpperCase() === FRASE;

  const reset = useMutation({
    mutationFn: async () => (await api.post('/admin/reset-operacion', { confirmacion: FRASE })).data,
    onSuccess: async (d: any) => {
      setConfirmOpen(false);
      setFrase('');

      /* El servidor ya quedó limpio. Falta la copia LOCAL de este escritorio
       * (pedidos y cola en su SQLite): si no se borra, seguiría mostrando datos
       * viejos y podría reenviarlos. Los celulares hacen lo propio al
       * sincronizar, gracias a la marca `operacionResetAt`. */
      try {
        const r = await window.electronAPI?.dbResetOperacion?.();
        if (r?.ok) console.log('[reset] copia local del escritorio borrada', r.borradas);
      } catch (e) {
        console.warn('[reset] no se pudo borrar la copia local del escritorio', e);
      }

      // Refrescar TODO lo que pueda tener datos operativos en pantalla.
      qc.clear();

      const n = (v: unknown) => Number(v ?? 0);
      const borrados = Object.values(d?.antes ?? {}).reduce((acc: number, v) => acc + n(v), 0);
      toast(
        `Operación restablecida: ${borrados} registros borrados. Backup previo: ${d?.backup?.archivo ?? '—'}. Los celulares se limpiarán al sincronizar.`,
        'success'
      );
    },
    onError: (e: any) => {
      setConfirmOpen(false);
      toast(e?.response?.data?.error || 'No se pudo restablecer la operación', 'error');
    }
  });

  return (
    <Card className="border-danger-200">
      <CardHeader>
        <CardTitle>
          <span className="inline-flex items-center gap-2 text-danger-700">
            <RotateCcw size={16} /> Restablecer operación
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-danger-50 border border-danger-200 p-4">
          <AlertTriangle size={20} className="text-danger-600 shrink-0 mt-0.5" />
          <div className="text-sm text-danger-800">
            <p className="font-semibold">Esto eliminará pedidos, ventas, pagos, movimientos, caja y gastos.</p>
            <p className="mt-1">
              Se borra <b>todo</b>: pedidos, pagos, caja, gastos, garantías, historiales,
              consolidaciones, rutas asignadas y la cola de sincronización — en el servidor,
              en este equipo y en <b>todos los celulares</b> (se limpian solos al sincronizar).
            </p>
            <p className="mt-1">
              Solo se conservan <b>clientes, prendas, marcas, colores, usuarios</b> y la
              configuración de empresa (logo, políticas y teléfonos). Se genera un backup
              automático antes de borrar.
            </p>
          </div>
        </div>

        <Field label={`Para confirmar, escribe exactamente: ${FRASE}`}>
          <Input
            value={frase}
            onChange={(e) => setFrase(e.target.value)}
            placeholder={FRASE}
            autoComplete="off"
          />
        </Field>

        <Button
          variant="danger"
          leftIcon={<RotateCcw size={15} />}
          disabled={!coincide || reset.isPending}
          loading={reset.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          Restablecer operación
        </Button>
      </CardBody>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Restablecer la operación desde cero?"
        message="Se eliminarán TODOS los pedidos, pagos, caja, sesiones, historial, garantías y gastos. Clientes, catálogo, colores, usuarios y configuración se conservan. Se generará un backup antes. Esta acción no se puede deshacer (salvo restaurando el backup)."
        destructive
        confirmLabel="Sí, restablecer"
        loading={reset.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => reset.mutate()}
      />
    </Card>
  );
}
