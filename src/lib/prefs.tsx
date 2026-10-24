import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { detectLang, setActiveLang, type Lang } from "./language";

export type Theme = "dark" | "light";

export interface Prefs {
  theme: Theme;
  driver: string | null;
  team: string | null;
  lang: Lang;
}

export const PREFS_KEY = "apex.prefs.v2";
export const DEFAULT_PREFS: Prefs = { theme: "dark", driver: null, team: null, lang: detectLang() };

export function sanitizePrefs(input: unknown, fallback: Prefs = DEFAULT_PREFS): Prefs {
  const raw = (input ?? {}) as Partial<Prefs>;
  return {
    theme: raw.theme === "light" || raw.theme === "dark" ? raw.theme : fallback.theme,
    driver: typeof raw.driver === "string" && raw.driver ? raw.driver : null,
    team: typeof raw.team === "string" && raw.team ? raw.team : null,
    lang: raw.lang === "en" || raw.lang === "pt" ? raw.lang : fallback.lang,
  };
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return sanitizePrefs(JSON.parse(raw), DEFAULT_PREFS);
  } catch {
    /* armazenamento indisponível */
  }
  return DEFAULT_PREFS;
}

export function savePrefs(prefs: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* armazenamento indisponível */
  }
}

export function applyLang(lang: Lang) {
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f2f3f6" : "#07080b");
}

interface PrefsValue {
  prefs: Prefs;
  setTheme: (theme: Theme) => void;
  setDriver: (code: string | null) => void;
  setTeam: (id: string | null) => void;
  setLang: (lang: Lang) => void;
  /** aplica preferências vindas da conta (login em outro dispositivo) */
  adopt: (prefs: Prefs) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

  // formatadores fora de React (datas, números) seguem o idioma já nesta render.
  setActiveLang(prefs.lang);

  useEffect(() => {
    applyTheme(prefs.theme);
    applyLang(prefs.lang);
    savePrefs(prefs);
  }, [prefs]);

  const setTheme = useCallback((theme: Theme) => setPrefs((p) => ({ ...p, theme })), []);
  const setDriver = useCallback((driver: string | null) => setPrefs((p) => ({ ...p, driver })), []);
  const setTeam = useCallback((team: string | null) => setPrefs((p) => ({ ...p, team })), []);
  const setLang = useCallback((lang: Lang) => setPrefs((p) => ({ ...p, lang })), []);
  const adopt = useCallback(
    (next: Prefs) => setPrefs((current) => ({ ...sanitizePrefs(next, current), theme: next.theme })),
    [],
  );

  const value = useMemo(
    () => ({ prefs, setTheme, setDriver, setTeam, setLang, adopt }),
    [prefs, setTheme, setDriver, setTeam, setLang, adopt],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error("usePrefs precisa estar dentro de PrefsProvider");
  return value;
}
