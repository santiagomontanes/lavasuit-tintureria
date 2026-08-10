import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

/* Modal de cliente: CREA (POST /clientes) o EDITA (PUT /clientes/:id).
 * Si se pasa `cliente`, entra en modo edición y precarga el formulario.
 * No cambia IDs ni toca pedidos del cliente: solo actualiza datos de contacto. */
interface Props {
  open:    boolean;
  onClose: () => void;
  cliente?: any | null;
}

const inicial = { nombre: '', telefono: '', email: '', direccion: '', notas: '', activo: true };

export default function NuevoClienteModal({ open, onClose, cliente }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const esEdicion = !!cliente?.id;

  const [form,    setForm]    = useState(inicial);
  const [tocado,  setTocado]  = useState(false);
  // Número base del cliente (solo al crear). Si se indica, el cliente recibe un
  // consecutivo del tipo {base}_{n} (ej. 288 → 288_1) vía /clientes/crear-en-ruta.
  const [numeroBase, setNumeroBase] = useState('');

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    setNumeroBase('');
    setForm(esEdicion ? {
      nombre:    cliente.nombre    ?? '',
      telefono:  cliente.telefono  ?? '',
      email:     cliente.email     ?? '',
      direccion: cliente.direccion ?? '',
      notas:     cliente.notas     ?? '',
      activo:    cliente.activo !== false
    } : inicial);
  }, [open, esEdicion, cliente]);

  const errNombre   = form.nombre.trim().length === 0;
  const errTelefono = form.telefono.trim().length < 6;
  const valid       = !errNombre && !errTelefono;

  const mutation = useMutation({
    mutationFn: (data: any) => {
      if (esEdicion) return api.put(`/clientes/${cliente.id}`, data).then((r) => r.data);
      // Con número base → crear-en-ruta (consecutivo {base}_{n}); sin él → suelto.
      const base = Number(numeroBase.trim());
      if (numeroBase.trim() && Number.isFinite(base)) {
        return api.post('/clientes/crear-en-ruta', { ...data, ordenBaseRef: base }).then((r) => r.data);
      }
      return api.post('/clientes', data).then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.show(esEdicion ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente', 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error
        || (esEdicion ? 'No se pudo actualizar el cliente' : 'No se pudo crear el cliente');
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;
    const base: any = {
      nombre:    form.nombre.trim(),
      telefono:  form.telefono.trim(),
      email:     form.email.trim()     || undefined,
      direccion: form.direccion.trim() || undefined,
      notas:     form.notas.trim()     || undefined
    };
    if (esEdicion) base.activo = form.activo;
    mutation.mutate(base);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esEdicion ? 'Editar cliente' : 'Nuevo cliente'}
      subtitle={esEdicion ? 'Actualiza los datos de contacto. No afecta sus pedidos.' : 'Registra los datos base para pedidos y contacto.'}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <Field label="Nombre *" error={tocado && errNombre ? 'El nombre es obligatorio' : undefined}>
          <Input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            autoFocus
          />
        </Field>

        <Field label="Telefono *" error={tocado && errTelefono ? 'Minimo 6 digitos' : undefined}>
          <Input
            value={form.telefono}
            onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
            inputMode="tel"
          />
        </Field>

        {!esEdicion && (
          <Field
            label="Número de cliente (base)"
            hint={numeroBase.trim()
              ? `Se asignará ${numeroBase.trim()}_n (consecutivo confirmado por el servidor).`
              : 'Opcional. Si lo dejas vacío, el cliente queda suelto (sin consecutivo).'}
          >
            <Input
              value={numeroBase}
              onChange={(e) => setNumeroBase(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              placeholder="Ej: 288"
            />
          </Field>
        )}

        <Field label="Email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>

        <Field label="Direccion">
          <Input
            value={form.direccion}
            onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
          />
        </Field>

        <Field label="Notas">
          <Textarea
            value={form.notas}
            onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
            rows={3}
          />
        </Field>

        {esEdicion && (
          <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            Cliente activo
          </label>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
