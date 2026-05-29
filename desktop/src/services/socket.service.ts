import { io, Socket } from 'socket.io-client';
import { ENV } from '../config/env';

export type EventName =
  | 'nuevo-pedido'
  | 'estado-cambiado'
  | 'pedido-actualizado'
  | 'pedido-eliminado'
  | 'pedido-entregado'
  | 'nuevo-cliente'
  | 'cliente-actualizado'
  | 'clientes-importados'
  | 'clientes-asignados'
  | 'nuevo-pago'
  | 'nueva-garantia'
  | 'garantia-actualizada'
  | 'servicio-creado'
  | 'servicio-actualizado'
  | 'servicio-eliminado'
  | 'servicios-importados'
  | 'marca-creada'
  | 'marca-actualizada'
  | 'marca-eliminada'
  | 'marcas-importadas'
  | 'color-creado'
  | 'color-actualizado'
  | 'color-eliminado';

type Handler = (data: any) => void;
type ConnHandler = (connected: boolean) => void;

let socket: Socket | null = null;
let connected = false;

const listeners: Record<EventName, Handler[]> = {
  'nuevo-pedido':       [],
  'estado-cambiado':    [],
  'pedido-actualizado': [],
  'pedido-eliminado':   [],
  'pedido-entregado':   [],
  'nuevo-cliente':      [],
  'cliente-actualizado':[],
  'clientes-importados':[],
  'clientes-asignados': [],
  'nuevo-pago':         [],
  'nueva-garantia':     [],
  'garantia-actualizada': [],
  'servicio-creado':      [],
  'servicio-actualizado': [],
  'servicio-eliminado':   [],
  'servicios-importados': [],
  'marca-creada':         [],
  'marca-actualizada':    [],
  'marca-eliminada':      [],
  'marcas-importadas':    [],
  'color-creado':         [],
  'color-actualizado':    [],
  'color-eliminado':      []
};
const connListeners: ConnHandler[] = [];

const setConnected = (v: boolean) => {
  connected = v;
  connListeners.forEach((l) => { try { l(v); } catch {} });
};

const dispatch = (evento: EventName, data: any) => {
  for (const h of listeners[evento]) {
    try { h(data); } catch (e) { console.warn('socket handler error', e); }
  }
};

export const connectSocket = (token?: string) => {
  if (socket?.connected) return socket;
  if (socket) socket.disconnect();

  socket = io(ENV.SOCKET_URL, {
    transports:        ['websocket'],
    reconnection:      true,
    reconnectionDelay: 2000,
    auth:              token ? { token } : undefined
  });

  socket.on('connect',       () => { console.log('[socket] conectado', socket?.id); setConnected(true); });
  socket.on('disconnect',    () => { console.log('[socket] desconectado'); setConnected(false); });
  socket.on('connect_error', (err) => { console.warn('[socket] error', err.message); setConnected(false); });

  (Object.keys(listeners) as EventName[]).forEach((evento) => {
    socket!.on(evento, (data: any) => dispatch(evento, data));
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    setConnected(false);
  }
};

export const onSocketEvent = (evento: EventName, handler: Handler) => {
  listeners[evento].push(handler);
  return () => {
    const i = listeners[evento].indexOf(handler);
    if (i >= 0) listeners[evento].splice(i, 1);
  };
};

export const onConnectionChange = (handler: ConnHandler) => {
  connListeners.push(handler);
  try { handler(connected); } catch {}
  return () => {
    const i = connListeners.indexOf(handler);
    if (i >= 0) connListeners.splice(i, 1);
  };
};

export const isSocketConnected = () => connected;
