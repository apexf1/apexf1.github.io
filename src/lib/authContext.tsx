import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { Prefs } from "./prefs";

export interface AuthUser {
  name: string;
  email: string;
  image: string | null;
}

export interface AuthValue {
  /** true quando VITE_CLERK_PUBLISHABLE_KEY está definida */
  configured: boolean;
  /** false enquanto o SDK ainda está a carregar a sessão */
  ready: boolean;
  user: AuthUser | null;
  signIn: () => void;
  signOut: () => void;
  /** preferências guardadas na conta, quando há sessão */
  remote: Partial<Prefs> | null;
  saveRemote: (prefs: Prefs) => Promise<void>;
  error: string | null;
  /** o modo local não tem conta: o perfil fica só neste navegador */
  localOnly: boolean;
}

export const localAuth: AuthValue = {
  configured: false,
  ready: true,
  user: null,
  signIn: () => {},
  signOut: () => {},
  remote: null,
  saveRemote: async () => {},
  error: null,
  localOnly: true,
};

export const AuthContext = createContext<AuthValue>(localAuth);

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

/** Perfil sem conta: todas as preferências ficam no localStorage. */
export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const signIn = useCallback(() => {}, []);
  const signOut = useCallback(() => {}, []);
  const value = useMemo<AuthValue>(
    () => ({ ...localAuth, signIn, signOut }),
    [signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const clerkKey = (): string => (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "").trim();

export const isClerkConfigured = (): boolean => clerkKey().startsWith("pk_");
