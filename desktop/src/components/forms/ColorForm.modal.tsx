import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

interface Color {
  id?:     string;
  nombre?: string;
  codigo?: string | null;
  hex?:    string | null;
  activo?: boolean;
}

interface Props {
  open:    boolean;
  onClose: () => void;
  color?:  Color | null;
}

const inicial = { nombre: '', codigo: '', hex: '', activo: true };

const hexValido = (s: string) => !s || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s);

export default function ColorFormModal({ open, onClose, color }: Props) {
  const qc = useQueryClient();
  const toast = useToastStore();
  const editando = !!color?.id;

  const [form, setForm] = useState(inicial);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    if (color) {
      setForm({
        nombre: color.nombre ?? '',
        codigo: color.codigo ?? '',
        hex:    color.hex ?? '',
        activo: color.activo !== false
      });
    } else setForm(inicial);
  }, [open, color]);

  const errNombre = form.nombre.trim().length === 0;
  const errHex    = !hexValido(form.hex.trim());
  const valid     = !errNombre && !errHex;

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editando) {
        const { data: res } = await api.patch(`/colores/${color!.id}`, data);
        return res;
      }
      const { data: res } = await api.post('/colores', data);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['colores'] });
      toast.show(editando ? 'Color actualizado' : 'Color creado', 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo guardar el color';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;
    mutation.mutate({
      nombre: form.nombre.trim(),
      codigo: form.codigo.trim() || null,
      hex:    form.hex.trim() || null,
      activo: form.activo
    });
  };

  const previewHex = !errHex && form.hex.trim() ? form.hex.trim() : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar color' : 'Nuevo color'}
      subtitle={editando
        ? 'Cambios aplican a futuros pedidos. Los históricos conservan el color anterior.'
        : 'Define un color para que esté disponible en el catálogo de prendas.'}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <Field label="Nombre *" error={tocado && errNombre ? 'Obligatorio' : undefined}>
          <Input
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            autoFocus maxLength={60}
            placeholder="Negro, Blanco, Beige…"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Código corto" hint="Opcional. Para autocomplete rápido (n, bl).">
            <Input
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              maxLength={30}
              placeholder="n"
            />
          </Field>
          <Field
            label="Hex"
            hint="Opcional. #RRGGBB para muestra visual."
            error={tocado && errHex ? 'Formato inválido (use #RRGGBB)' : undefined}
          >
            <div className="flex items-center gap-2">
              <Input
                value={form.hex}
                onChange={(e) => setForm((f) => ({ ...f, hex: e.target.value }))}
                maxLength={9}
                placeholder="#0F172A"
              />
              {previewHex ? (
                <span
                  className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 shadow-inner"
                  style={{ backgroundColor: previewHex }}
                  aria-label="Vista previa del color"
                />
              ) : null}
            </div>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
          />
          Color activo (visible en el catálogo)
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Guardar cambios' : 'Crear color'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
