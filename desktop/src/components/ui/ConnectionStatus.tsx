import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { onConnectionChange, isSocketConnected } from '../../services/socket.service';
import { cn } from '../../lib/cn';

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(isSocketConnected());

  useEffect(() => onConnectionChange(setConnected), []);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 h-8 px-3 rounded-full text-xs font-medium border transition-colors shadow-sm',
        connected
          ? 'bg-success-50 text-success-700 border-success-200'
          : 'bg-warning-50 text-warning-700 border-warning-200'
      )}
      title={connected ? 'Conectado en tiempo real' : 'Sin conexión en tiempo real'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          connected ? 'bg-success-500 animate-pulse' : 'bg-warning-500'
        )}
      />
      {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
      <span>{connected ? 'En vivo' : 'Sin tiempo real'}</span>
    </div>
  );
}
