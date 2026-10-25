import { Capacitor } from "@capacitor/core";
import type { useSignIn, useSignUp } from "@clerk/clerk-react";

// derivados dos hooks porque o pacote não reexporta os tipos dos recursos
type SignInAttempt = NonNullable<ReturnType<typeof useSignIn>["signIn"]>;
type SignUpAttempt = NonNullable<ReturnType<typeof useSignUp>["signUp"]>;

/**
 * Login Google dentro do APK.
 *
 * O Google recusa OAuth em WebViews (`disallowed_useragent`), por isso o pedido
 * sai para o browser do sistema (Custom Tabs). O Clerk devolve o controlo à app
 * por um deep link `com.apexf1.hub://sso-callback`; aqui esse link é trocado
 * pela sessão. O endereço tem de estar autorizado em dois sítios:
 *  - Clerk Dashboard → Native applications → Allowlist for mobile SSO redirect
 *  - android/app/src/main/AndroidManifest.xml (intent-filter)
 */
export const IS_NATIVE = Capacitor.isNativePlatform();

export const OAUTH_SCHEME = "com.apexf1.hub";
export const OAUTH_CALLBACK = `${OAUTH_SCHEME}://sso-callback`;

export function isOAuthCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === `${OAUTH_SCHEME}:` && parsed.hostname === "sso-callback";
  } catch {
    return false;
  }
}

/** Cria a tentativa no Clerk e abre o consentimento do Google fora do WebView. */
export async function openNativeGoogleSignIn(signIn: SignInAttempt): Promise<void> {
  const attempt = await signIn.create({
    strategy: "oauth_google",
    redirectUrl: OAUTH_CALLBACK,
    actionCompleteRedirectUrl: OAUTH_CALLBACK,
  });
  const url = attempt.firstFactorVerification.externalVerificationRedirectURL;
  if (!url) throw new Error("Clerk não devolveu o endereço de verificação do Google.");
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: url.toString() });
}

export async function closeNativeBrowser(): Promise<void> {
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch {
    /* o browser do sistema pode já estar fechado */
  }
}

export type OAuthResult = "done" | "incomplete";

/**
 * Completa a tentativa com o nonce que o Clerk devolve no deep link e ativa a
 * sessão. Numa conta Google nova, o Clerk entrega a tentativa ao sign-up; nesse
 * caso transfere-se e ativa-se a sessão criada.
 */
export async function completeNativeGoogleSignIn(
  signIn: SignInAttempt,
  signUp: SignUpAttempt | null,
  setActive: (params: { session: string }) => Promise<void>,
  nonce: string,
): Promise<OAuthResult> {
  await signIn.reload({ rotatingTokenNonce: nonce });
  if (signIn.createdSessionId) {
    await setActive({ session: signIn.createdSessionId });
    return "done";
  }

  if (signUp) {
    try {
      await signUp.create({ transfer: true });
      await signUp.reload({ rotatingTokenNonce: nonce });
      if (signUp.createdSessionId) {
        await setActive({ session: signUp.createdSessionId });
        return "done";
      }
    } catch {
      /* cai no resultado "incomplete" e o utilizador recebe uma mensagem */
    }
  }

  return "incomplete";
}
