import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Textarea } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

interface Props { open: boolean; onClose: () => void; }

const inicial = { nombre: '', telefono: '', email: '', direccion: '', notas: '' };

export default function NuevoClienteModal({ open, onClose }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();

  const [form,    setForm]    = useState(inicial);
  const [tocado,  setTocado]  = useState(false);

  useEffect(() => { if (open) { setForm(inicial); setTocado(false); } }, [open]);

  const errNombre   = form.nombre.trim().length === 0;
  const errTelefono = form.telefono.trim().length < 6;
  const valid       = !errNombre && !errTelefono;

  const mutation = useMutation({
    mutationFn: (data: any) =>
      api.post('/clientes', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] });
      toast.show('Cliente creado correctamente', 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo crear el cliente';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;
    mutation.mutate({
      nombre:    form.nombre.trim(),
      telefono:  form.telefono.trim(),
      email:     form.email.trim()     || undefined,
      direccion: form.direccion.trim() || undefined,
      notas:     form.notas.trim()     || undefined
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente" subtitle="Registra los datos base para pedidos y contacto.">
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
