import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

interface Props {
  open:           boolean;
  title:          string;
  message:        string;
  confirmLabel?:  string;
  cancelLabel?:   string;
  destructive?:   boolean;
  loading?:       boolean;
  onConfirm:      () => void;
  onCancel:       () => void;
}

export default function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirmar',
  cancelLabel  = 'Cancelar',
  destructive  = false,
  loading      = false,
  onConfirm, onCancel
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <div className="px-6 py-5">
        <div className="flex items-start gap-3">
          {destructive && (
            <div className="shrink-0 w-9 h-9 rounded-full bg-danger-50 flex items-center justify-center">
              <AlertTriangle size={18} className="text-danger-600" />
            </div>
          )}
          <p className="text-sm text-slate-600 flex-1 leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            size="sm"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
