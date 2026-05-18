import { create } from 'zustand';
import api from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket.service';

interface Usuario { id: string; nombre: string; email: string; rol: string; }

interface AuthState {
  token:        string | null;
  usuario:      Usuario | null;
  loading:      boolean;
  error:        string | null;
  login:        (email: string, password: string) => Promise<void>;
  logout:       () => void;
  forzarLogout: () => void;
}

const leerUsuarioLS = (): Usuario | null => {
  try {
    const raw = localStorage.getItem('usuario');
    return raw ? JSON.parse(raw) as Usuario : null;
  } catch { return null; }
};

const tokenInicial   = localStorage.getItem('token');
const usuarioInicial = leerUsuarioLS();

if (tokenInicial) {
  connectSocket(tokenInicial);
}

export const useAuthStore = create<AuthState>((set) => ({
  token:   tokenInicial,
  usuario: usuarioInicial,
  loading: false,
  error:   null,

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('token',   data.token);
      localStorage.setItem('usuario', JSON.stringify(data.usuario));
      connectSocket(data.token);
      set({ token: data.token, usuario: data.usuario, loading: false, error: null });
    } catch (e: any) {
      const msg = e?.response?.data?.error || 'Error de conexión con el servidor';
      set({ loading: false, error: msg });
      throw e;
    }
  },

  logout: () => {
    disconnectSocket();
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    set({ token: null, usuario: null, error: null });
  },

  forzarLogout: () => {
    disconnectSocket();
    set({ token: null, usuario: null, error: 'Sesión expirada' });
  }
}));
