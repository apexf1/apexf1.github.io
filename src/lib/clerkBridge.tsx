import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  useClerk,
  useSignIn,
  useUser,
} from "@clerk/clerk-react";
import { AuthContext, clerkKey, type AuthUser, type AuthValue } from "./authContext";
import type { Prefs } from "./prefs";

const isSsoCallback = () => window.location.hash.startsWith("#sso-callback");

const readRemote = (metadata: unknown): Partial<Prefs> | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const apex = (metadata as Record<string, unknown>).apex;
  if (!apex || typeof apex !== "object") return null;
  const raw = apex as Record<string, unknown>;
  const out: Partial<Prefs> = {};
  if (raw.theme === "light" || raw.theme === "dark") out.theme = raw.theme;
  if (typeof raw.driver === "string" && raw.driver) out.driver = raw.driver;
  if (typeof raw.team === "string" && raw.team) out.team = raw.team;
  if (raw.lang === "pt" || raw.lang === "en") out.lang = raw.lang;
  return Object.keys(out).length ? out : null;
};

function Bridge({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  const { signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);

  const metadata = user?.unsafeMetadata;
  // derivado do user (não guardado em estado): a primeira render com sessão já
  // traz as preferências da conta, senão o perfil local sobrepunha-se-lhes.
  const remote = useMemo(() => readRemote(metadata), [metadata]);

  const signInWithGoogle = useCallback(() => {
    if (!signIn) {
      setError("O login ainda está a carregar. Espera um segundo e tenta de novo.");
      return;
    }
    setError(null);
    const base = `${window.location.origin}${window.location.pathname}`;
    void signIn
      .authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${base}#sso-callback`,
        redirectUrlComplete: base,
      })
      .catch(() => {
        setError("Não foi possível abrir o login do Google. Tenta outra vez.");
      });
  }, [signIn]);

  const signOut = useCallback(() => {
    void clerkSignOut({
      redirectUrl: `${window.location.origin}${window.location.pathname}`,
    });
  }, [clerkSignOut]);

  const saveRemote = useCallback(
    async (prefs: Prefs) => {
      if (!user) return;
      try {
        await user.update({
          unsafeMetadata: { ...user.unsafeMetadata, apex: prefs },
        });
      } catch {
        setError("As preferências não foram sincronizadas com a conta.");
      }
    },
    [user],
  );

  const profile: AuthUser | null = user
    ? {
        name:
          user.fullName ||
          user.username ||
          user.primaryEmailAddress?.emailAddress.split("@")[0] ||
          "Piloto",
        email: user.primaryEmailAddress?.emailAddress ?? "",
        image: user.imageUrl || null,
      }
    : null;

  const value = useMemo<AuthValue>(
    () => ({
      configured: true,
      ready: isLoaded,
      user: profile,
      signIn: signInWithGoogle,
      signOut,
      remote,
      saveRemote,
      error,
      localOnly: false,
    }),
    [isLoaded, profile?.name, profile?.email, profile?.image, signInWithGoogle, signOut, remote, saveRemote, error],
  );

  if (isSsoCallback()) {
    return (
      <AuthContext.Provider value={value}>
        <div className="auth-callback">
          <div className="auth-card panel panel-pad">
            <div className="micro micro-red">A entrar</div>
            <h2>A finalizar o login com o Google</h2>
            <p className="note">Só um instante — vamos buscar o teu perfil.</p>
            <AuthenticateWithRedirectCallback
              signInFallbackRedirectUrl="/"
              signUpFallbackRedirectUrl="/"
            />
          </div>
        </div>
      </AuthContext.Provider>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function ClerkBridge({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider publishableKey={clerkKey()} afterSignOutUrl="/">
      <Bridge>{children}</Bridge>
    </ClerkProvider>
  );
}
