import { en } from "./locales/en";

export type Lang = "pt" | "en";

export const LANGS: { id: Lang; label: string; short: string }[] = [
  { id: "pt", label: "Português", short: "PT" },
  { id: "en", label: "English", short: "EN" },
];

export const LOCALES: Record<Lang, string> = { pt: "pt-PT", en: "en-GB" };

export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "pt";
  return /^en\b/i.test(navigator.language) ? "en" : "pt";
}

// Idioma ativo fora de React (formatadores, partilha). Actualizado pelo PrefsProvider.
let active: Lang = detectLang();

export const activeLang = () => active;
export const setActiveLang = (lang: Lang) => {
  active = lang;
};
export const locale = () => LOCALES[active];

export type Vars = Record<string, string | number | null | undefined>;

/**
 * O texto em português é a própria chave: se faltar tradução, mostra-se o
 * original em vez de uma chave técnica. Os marcadores `{nome}` são substituídos.
 */
export function translate(lang: Lang, text: string, vars?: Vars): string {
  const template = lang === "en" ? en[text] ?? text : text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Tradução fora de componentes, com o idioma que estiver activo. */
export const tStatic = (text: string, vars?: Vars) => translate(active, text, vars);
