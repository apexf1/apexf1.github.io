import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  useClerk,
  useSignIn,
  useSignUp,
  useUser,
} from "@clerk/clerk-react";
import { AuthContext, clerkKey, type AuthUser, type AuthValue } from "./authContext";
import type { Prefs } from "./prefs";
import { isValidTimeZone } from "./timezone";
import {
  IS_NATIVE,
  closeNativeBrowser,
  completeNativeGoogleSignIn,
  isOAuthCallback,
  openNativeGoogleSignIn,
} from "./nativeAuth";

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
  if (isValidTimeZone(raw.timezone)) out.timezone = raw.timezone;
  return Object.keys(out).length ? out : null;
};

function Bridge({ children }: { children: ReactNode }) {
  const { user, isLoaded } = useUser();
  const { signOut: clerkSignOut, setActive } = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
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
    // no APK o consentimento do Google tem de acontecer no browser do sistema
    if (IS_NATIVE) {
      void openNativeGoogleSignIn(signIn).catch(() => {
        setError(
          "Não foi possível abrir o Google. Se continuar, autoriza com.apexf1.hub://sso-callback no Clerk, em Native applications.",
        );
      });
      return;
    }
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

  // regresso do browser do sistema: com.apexf1.hub://sso-callback?rotating_token_nonce=…
  useEffect(() => {
    if (!IS_NATIVE || !signIn) return;
    let disposed = false;
    let remove: (() => Promise<void>) | null = null;

    const finish = async (url: string) => {
      if (!isOAuthCallback(url)) return;
      await closeNativeBrowser();
      const nonce = new URL(url).searchParams.get("rotating_token_nonce");
      if (!nonce) {
        setError("O Google voltou à app sem a confirmação do Clerk. Tenta entrar outra vez.");
        return;
      }
      try {
        const result = await completeNativeGoogleSignIn(signIn, signUp ?? null, setActive, nonce);
        if (result === "incomplete") {
          setError("Faltou concluir o registo no Clerk. Tenta entrar outra vez.");
        } else {
          setError(null);
        }
      } catch {
        setError("Não foi possível concluir o login. Tenta outra vez.");
      }
    };

    void (async () => {
      const { App: NativeApp } = await import("@capacitor/app");
      const handle = await NativeApp.addListener("appUrlOpen", ({ url }) => void finish(url));
      remove = handle.remove;
      if (disposed) {
        void handle.remove();
        return;
      }
      const launch = await NativeApp.getLaunchUrl();
      if (launch?.url) void finish(launch.url);
    })();

    return () => {
      disposed = true;
      if (remove) void remove();
    };
  }, [signIn, signUp, setActive]);

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
