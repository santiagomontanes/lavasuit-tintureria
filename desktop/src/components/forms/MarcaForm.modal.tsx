import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

interface Marca {
  id?:           string;
  nombre?:       string;
  codigo?:       string | null;
  abreviaturas?: string | null;
  activo?:       boolean;
}

interface Props {
  open:    boolean;
  onClose: () => void;
  marca?:  Marca | null;
}

const inicial = { nombre: '', codigo: '', abreviaturas: '', activo: true };

export default function MarcaFormModal({ open, onClose, marca }: Props) {
  const qc = useQueryClient();
  const toast = useToastStore();
  const editando = !!marca?.id;

  const [form, setForm] = useState(inicial);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    if (marca) {
      setForm({
        nombre:       marca.nombre ?? '',
        codigo:       marca.codigo ?? '',
        abreviaturas: marca.abreviaturas ?? '',
        activo:       marca.activo !== false
      });
    } else setForm(inicial);
  }, [open, marca]);

  const errNombre = form.nombre.trim().length === 0;
  const valid     = !errNombre;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editando) {
        const { data: res } = await api.patch(`/marcas/${marca!.id}`, data);
        return res;
      }
      const { data: res } = await api.post('/marcas', data);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marcas'] });
      toast.show(editando ? 'Marca actualizada' : 'Marca creada', 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo guardar la marca';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;
    mutation.mutate({
      nombre:       form.nombre.trim(),
      codigo:       form.codigo.trim() || null,
      abreviaturas: form.abreviaturas.trim() || null,
      activo:       form.activo
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar marca' : 'Nueva marca'}
      subtitle={editando
        ? 'Cambios aplican a los próximos pedidos. Los históricos conservan la marca anterior.'
        : 'Define una marca para asociarla a las prendas en el catálogo.'}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <Field label="Nombre *" error={tocado && errNombre ? 'Obligatorio' : undefined}>
          <Input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            autoFocus maxLength={100}
            placeholder="Zara, Nike, Adidas…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código corto" hint="Identificador interno para autocomplete (z, ni…).">
            <Input
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              maxLength={30}
              placeholder="z"
            />
          </Field>
          <Field label="Abreviaturas" hint="Separadas por coma (z, za, zar).">
            <Input
              value={form.abreviaturas}
              onChange={(e) => setForm((f) => ({ ...f, abreviaturas: e.target.value }))}
              maxLength={255}
              placeholder="z, za, zar"
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
          />
          Marca activa (visible en el catálogo)
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Guardar cambios' : 'Crear marca'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
