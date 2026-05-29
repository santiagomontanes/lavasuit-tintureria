import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Field, Input, Select } from '../ui/Input';
import api from '../../services/api';
import { useToastStore } from '../../store/toast.store';

type Rol = 'ADMIN' | 'EMPLEADO' | 'CAJERO' | 'RECOLECTOR';
const ROLES: Rol[] = ['ADMIN', 'EMPLEADO', 'CAJERO', 'RECOLECTOR'];

interface EmpleadoEditable {
  id?:     string;
  nombre?: string;
  email?:  string;
  rol?:    string;
  activo?: boolean;
}

interface Props {
  open:      boolean;
  onClose:   () => void;
  empleado?: EmpleadoEditable | null;
}

const emailValido = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function EmpleadoFormModal({ open, onClose, empleado }: Props) {
  const qc       = useQueryClient();
  const toast    = useToastStore();
  const editando = !!empleado?.id;

  const [nombre,     setNombre]     = useState('');
  const [email,      setEmail]      = useState('');
  const [rol,        setRol]        = useState<Rol>('EMPLEADO');
  const [activo,     setActivo]     = useState(true);
  const [password,   setPassword]   = useState('');
  const [cambiarPwd, setCambiarPwd] = useState(false);
  const [tocado,     setTocado]     = useState(false);

  useEffect(() => {
    if (!open) return;
    setTocado(false);
    setPassword(''); setCambiarPwd(false);
    if (empleado) {
      setNombre(empleado.nombre ?? '');
      setEmail(empleado.email ?? '');
      setRol((ROLES.includes(empleado.rol as Rol) ? empleado.rol : 'EMPLEADO') as Rol);
      setActivo(empleado.activo !== false);
    } else {
      setNombre(''); setEmail(''); setRol('EMPLEADO'); setActivo(true);
    }
  }, [open, empleado]);

  const errNombre = nombre.trim().length === 0;
  const errEmail  = !emailValido(email);
  const errPwd    = !editando ? password.length < 8 : (cambiarPwd && password.length < 8);
  const valid     = !errNombre && !errEmail && !errPwd;

  const crearMutation = useMutation({
    mutationFn: (data: any) => api.post('/usuarios', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empleados'] });
      toast.show('Usuario creado correctamente', 'success');
      onClose();
    },
    onError: (e: any) => toast.show(e?.response?.data?.error || 'No se pudo crear el usuario', 'error')
  });

  const editarMutation = useMutation({
    mutationFn: (data: any) => api.patch(`/usuarios/${empleado!.id}`, data).then((r) => r.data),
    onSuccess: async () => {
      if (cambiarPwd && password) {
        try {
          await api.patch(`/usuarios/${empleado!.id}/password`, { password });
        } catch (e: any) {
          toast.show(e?.response?.data?.error || 'Usuario actualizado pero contraseña no cambió', 'error');
          qc.invalidateQueries({ queryKey: ['empleados'] });
          return;
        }
      }
      qc.invalidateQueries({ queryKey: ['empleados'] });
      toast.show('Usuario actualizado', 'success');
      onClose();
    },
    onError: (e: any) => toast.show(e?.response?.data?.error || 'No se pudo actualizar', 'error')
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTocado(true);
    if (!valid) return;

    if (editando) {
      editarMutation.mutate({
        nombre: nombre.trim(),
        email:  email.trim().toLowerCase(),
        rol,
        activo
      });
    } else {
      crearMutation.mutate({
        nombre:   nombre.trim(),
        email:    email.trim().toLowerCase(),
        rol,
        activo,
        password
      });
    }
  };

  const enviando = crearMutation.isPending || editarMutation.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar usuario' : 'Nuevo usuario'}
      subtitle={editando
        ? 'Cambia el rol, estado o restablece contraseña.'
        : 'Crea una nueva cuenta para iniciar sesión.'}
    >
      <form onSubmit={submit} className="p-6 space-y-4">
        <Field label="Nombre *" error={tocado && errNombre ? 'El nombre es obligatorio' : undefined}>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
            maxLength={100}
          />
        </Field>

        <Field label="Email *" error={tocado && errEmail ? 'Email inválido' : undefined}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={150}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Rol *">
            <Select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={activo ? '1' : '0'} onChange={(e) => setActivo(e.target.value === '1')}>
              <option value="1">Activo</option>
              <option value="0">Inactivo</option>
            </Select>
          </Field>
        </div>

        {!editando ? (
          <Field label="Contraseña *" error={tocado && errPwd ? 'Mínimo 8 caracteres' : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
            />
          </Field>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cambiarPwd}
                onChange={(e) => { setCambiarPwd(e.target.checked); if (!e.target.checked) setPassword(''); }}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              <KeyRound size={14} className="text-slate-500" />
              Restablecer contraseña
            </label>
            {cambiarPwd && (
              <Field label="Nueva contraseña *" error={tocado && errPwd ? 'Mínimo 8 caracteres' : undefined}>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                />
              </Field>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            {editando ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
