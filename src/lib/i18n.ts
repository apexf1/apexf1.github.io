import { useCallback, useMemo } from "react";
import { usePrefs } from "./prefs";
import { LOCALES, translate, type Lang, type Vars } from "./language";

export type { Lang, Vars } from "./language";
export { LANGS, LOCALES, detectLang, translate, tStatic, activeLang, locale } from "./language";

/** Idioma da app + tradutor reativo: mudar de idioma re-renderiza tudo. */
export function useI18n() {
  const { prefs, setLang } = usePrefs();
  const lang = prefs.lang;
  const t = useCallback((text: string, vars?: Vars) => translate(lang, text, vars), [lang]);
  return useMemo(
    () => ({ lang, t, setLang, locale: LOCALES[lang] }),
    [lang, t, setLang],
  );
}

export type { Lang as AppLang };
