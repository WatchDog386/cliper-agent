import { create } from 'zustand';
import type { User } from '../api/types';
import { secureStorage } from './storage';

const KEY = 'cliper.session';

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setSession: (token: string, user: User) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  hydrate: async () => {
    try {
      const raw = await secureStorage.get(KEY);
      if (raw) set(JSON.parse(raw) as { token: string; user: User });
    } catch {
      /* corrupted: signed out */
    } finally {
      set({ hydrated: true });
    }
  },
  setSession: async (token, user) => {
    set({ token, user });
    await secureStorage.set(KEY, JSON.stringify({ token, user }));
  },
  updateUser: async (user) => {
    set({ user });
    const token = get().token;
    if (token) await secureStorage.set(KEY, JSON.stringify({ token, user }));
  },
  logout: async () => {
    set({ token: null, user: null });
    await secureStorage.remove(KEY);
  },
}));
