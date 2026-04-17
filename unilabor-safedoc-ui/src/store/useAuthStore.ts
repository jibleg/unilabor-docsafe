import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ModuleAccess, ModuleCode, User } from '../types/models';

interface AuthState {
  token: string | null;
  user: User | null;
  availableModules: ModuleAccess[];
  activeModule: ModuleCode | null;
  setAuth: (token: string, user: User, availableModules?: ModuleAccess[]) => void;
  setUser: (user: User | null) => void;
  setAvailableModules: (modules: ModuleAccess[]) => void;
  setActiveModule: (moduleCode: ModuleCode | null) => void;
  setMustChangePassword: (value: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      availableModules: [],
      activeModule: null,
      setAuth: (token, user, availableModules = []) =>
        set({
          token,
          user,
          availableModules,
          activeModule:
            availableModules.length === 1 ? availableModules[0].code : null,
        }),
      setUser: (user) => set({ user }),
      setAvailableModules: (availableModules) =>
        set((state) => ({
          availableModules,
          activeModule:
            availableModules.some((moduleAccess) => moduleAccess.code === state.activeModule)
              ? state.activeModule
              : availableModules.length === 1
                ? availableModules[0].code
                : null,
        })),
      setActiveModule: (activeModule) => set({ activeModule }),
      setMustChangePassword: (value) =>
        set((state) => ({
          user: state.user ? { ...state.user, mustChangePassword: value } : state.user,
        })),
      logout: () => set({ token: null, user: null, availableModules: [], activeModule: null }),
    }),
    { name: 'auth-storage' }
  )
);
