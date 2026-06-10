import { create } from "zustand";

interface AppConfig {
  ldapHost: string;
  ldapPort: number;
  ldapBaseDn: string;
  ldapUseTls: boolean;
  ldapUserAttribute: string;
  dbUrl: string;
  appName: string;
}

interface AppState {
  config: AppConfig | null;
  isConfigured: boolean;
  dbConnected: boolean;
  isInitializing: boolean;
  initError: string | null;
  setConfig: (config: AppConfig) => void;
  setDbConnected: (connected: boolean) => void;
  setInitializing: (initializing: boolean) => void;
  setInitError: (error: string | null) => void;
}

export const useAppStore = create<AppState>()((set) => ({
  config: null,
  isConfigured: false,
  dbConnected: false,
  isInitializing: true,
  initError: null,
  setConfig: (config) => set({ config, isConfigured: true }),
  setDbConnected: (dbConnected) => set({ dbConnected }),
  setInitializing: (isInitializing) => set({ isInitializing }),
  setInitError: (initError) => set({ initError }),
}));
