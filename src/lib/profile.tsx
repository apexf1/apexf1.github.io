import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
import { usePrefs } from "./prefs";

/**
 * Liga as preferências locais à conta: ao entrar, adota o que está guardado
 * na conta (ou envia o perfil deste navegador, quando a conta ainda está vazia);
 * depois mantém os dois lados alinhados.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { prefs, adopt } = usePrefs();
  const synced = useRef<string | null>(null);
  const lastSent = useRef<string | null>(null);
  const email = auth.user?.email ?? null;

  useEffect(() => {
    if (!auth.ready || !email) {
      synced.current = null;
      lastSent.current = null;
      return;
    }

    // Primeira passagem com esta conta: a conta manda, o local só preenche vazios.
    if (synced.current !== email) {
      synced.current = email;
      if (auth.remote) {
        const merged = {
          theme: auth.remote.theme ?? prefs.theme,
          driver: auth.remote.driver ?? prefs.driver,
          team: auth.remote.team ?? prefs.team,
          lang: auth.remote.lang ?? prefs.lang,
          timezone: auth.remote.timezone ?? prefs.timezone,
        };
        lastSent.current = JSON.stringify(merged);
        adopt(merged);
        return;
      }
      lastSent.current = JSON.stringify(prefs);
      void auth.saveRemote(prefs);
      return;
    }

    // Sessão já ligada: guarda neste navegador e na conta o que mudou.
    const snapshot = JSON.stringify(prefs);
    if (snapshot === lastSent.current) return;
    lastSent.current = snapshot;
    void auth.saveRemote(prefs);
  }, [auth.ready, email, auth.remote, prefs]);

  return <>{children}</>;
}
