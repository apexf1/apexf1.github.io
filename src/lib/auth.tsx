import { Suspense, lazy } from "react";
import type { ReactNode } from "react";
import { LocalAuthProvider, isClerkConfigured } from "./authContext";

const ClerkBridge = lazy(() => import("./clerkBridge"));

export { useAuth } from "./authContext";
export type { AuthUser, AuthValue } from "./authContext";

/**
 * Com `VITE_CLERK_PUBLISHABLE_KEY` definida, a app usa o Clerk (login Google).
 * Sem chave, tudo funciona em modo local: perfil neste navegador, sem conta.
 * O SDK do Clerk é carregado num chunk separado, só quando faz falta.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    return <LocalAuthProvider>{children}</LocalAuthProvider>;
  }
  return (
    <Suspense fallback={<LocalAuthProvider>{children}</LocalAuthProvider>}>
      <ClerkBridge>{children}</ClerkBridge>
    </Suspense>
  );
}
