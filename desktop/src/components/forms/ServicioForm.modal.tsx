import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Textarea, Select } from '../ui/Input';
import Autocomplete, { AutocompleteItem } from '../ui/Autocomplete';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

interface Marca extends AutocompleteItem { id: string; nombre: string; codigo?: string | null }

interface Servicio {
  id?:           string;
  nombre?:       string;
  precio?:       number | string;
  unidad?:       string;
  categoria?:    string | null;
  descripcion?:  string | null;
  activo?:       boolean;
  codigo?:       string | null;
  abreviaturas?: string | null;
  marcaId?:      string | null;
  marca?:        Marca | null;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  servicio?: Servicio | null;
}

const inicial = {
  nombre:       '',
  precio:       '',
  unidad:       'prenda',
  categoria:    '',
  descripcion:  '',
  activo:       true,
  codigo:       '',
  abreviaturas: ''
};

const UNIDADES = ['prenda', 'kg', 'docena', 'metro', 'unidad', 'par', 'juego'];

export default function ServicioFormModal({ open, onClose, servicio }: Props) {
  const qc    = useQueryClient();
  const toast = useToastStore();
  const editando = !!servicio?.id;

  const [form,   setForm]   = useState(inicial);
  const [marca,  setMarca]  = useState<Marca | null>(null);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    if (servicio) {
      setForm({
        nombre:       servicio.nombre      ?? '',
        precio:       servicio.precio != null ? String(servicio.precio) : '',
        unidad:       servicio.unidad      ?? 'prenda',
        categoria:    servicio.categoria   ?? '',
        descripcion:  servicio.descripcion ?? '',
        activo:       servicio.activo !== false,
        codigo:       servicio.codigo      ?? '',
        abreviaturas: servicio.abreviaturas ?? ''
      });
      setMarca(servicio.marca ?? null);
    } else {
      setForm(inicial);
      setMarca(null);
    }
  }, [open, servicio]);

  const precioNum = Number(String(form.precio).replace(',', '.'));
  const errNombre = form.nombre.trim().length === 0;
  const errPrecio = !Number.isFinite(precioNum) || precioNum < 0;
  const valid     = !errNombre && !errPrecio;

  const buscarMarcas = async (q: string): Promise<Marca[]> => {
    const { data } = await api.get('/marcas/autocomplete', { params: { q, limit: 12 } });
    return data;
  };

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      if (editando) {
        const { data: res } = await api.patch(`/servicios/${servicio!.id}`, data);
        return res;
      }
      const { data: res } = await api.post('/servicios', data);
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['servicios'] });
      toast.show(editando ? 'Prenda actualizada' : 'Prenda creada', 'success');
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.error || 'No se pudo guardar la prenda';
      toast.show(msg, 'error');
    }
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;
    mutation.mutate({
      nombre:       form.nombre.trim(),
      precio:       precioNum,
      unidad:       form.unidad,
      categoria:    form.categoria.trim() || null,
      descripcion:  form.descripcion.trim() || null,
      activo:       form.activo,
      codigo:       form.codigo.trim() || null,
      abreviaturas: form.abreviaturas.trim() || null,
      marcaId:      marca?.id ?? null
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar prenda' : 'Nueva prenda'}
      subtitle={editando
        ? 'Los cambios no afectan pedidos históricos (mantienen nombre y precio originales).'
        : 'Define una prenda reutilizable del catálogo.'}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Código" hint="Para autocomplete (cam, ph…).">
            <Input
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              maxLength={30}
              placeholder="cam"
            />
          </Field>
          <Field label="Nombre *" className="col-span-2" error={tocado && errNombre ? 'Obligatorio' : undefined}>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              autoFocus maxLength={100}
              placeholder="Camisa"
            />
          </Field>
        </div>

        <Field label="Abreviaturas" hint="Separadas por coma (cam, c). Se usan en autocomplete del POS.">
          <Input
            value={form.abreviaturas}
            onChange={(e) => setForm((f) => ({ ...f, abreviaturas: e.target.value }))}
            maxLength={255}
            placeholder="cam, c"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Precio (COP) *" error={tocado && errPrecio ? 'Debe ser un número >= 0' : undefined}>
            <Input
              value={form.precio}
              onChange={(e) => setForm((f) => ({ ...f, precio: e.target.value.replace(/[^0-9.,]/g, '') }))}
              inputMode="decimal"
            />
          </Field>
          <Field label="Unidad">
            <Select
              value={form.unidad}
              onChange={(e) => setForm((f) => ({ ...f, unidad: e.target.value }))}
            >
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoría" hint="Opcional (lavado, tintura…).">
            <Input
              value={form.categoria}
              onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}
              maxLength={60}
              placeholder="lavado"
            />
          </Field>
          <Field label="Marca" hint="Buscar por código o nombre (z, ni…).">
            <Autocomplete<Marca>
              value={marca}
              onSelect={setMarca}
              onClear={() => setMarca(null)}
              fetcher={buscarMarcas}
              placeholder="Sin marca"
            />
          </Field>
        </div>

        <Field label="Descripción">
          <Textarea
            value={form.descripcion}
            onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
            rows={2}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300 text-primary-600"
          />
          Prenda activa (visible en el catálogo)
        </label>

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" onClick={onClose} disabled={mutation.isPending} variant="secondary">
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            {editando ? 'Guardar cambios' : 'Crear prenda'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
