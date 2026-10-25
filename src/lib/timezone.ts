import { activeLang } from "./language";

/**
 * Fuso horário escolhido pelo utilizador.
 *
 * `null` significa automático: segue o fuso do dispositivo. Os formatadores
 * fora de React (datas, horas) leem o valor ativo, tal como o idioma: o
 * PrefsProvider actualiza-o antes de desenhar os filhos.
 */

const FALLBACK_ZONES = [
  "UTC",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "America/Sao_Paulo",
  "America/New_York",
  "America/Los_Angeles",
];

export const TIME_ZONES: string[] = (() => {
  let values: string[] = [];
  try {
    values =
      typeof Intl.supportedValuesOf === "function" ? [...Intl.supportedValuesOf("timeZone")] : [];
  } catch {
    values = [];
  }
  const list = values.length ? values : [...FALLBACK_ZONES];
  for (const zone of FALLBACK_ZONES) {
    if (!list.includes(zone)) list.push(zone);
  }
  return list.sort((a, b) => a.localeCompare(b, "en"));
})();

export function isValidTimeZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || !zone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Fuso do dispositivo (o do sistema, quando o utilizador não escolhe outro). */
export function deviceTimeZone(): string {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}

let active: string | null = null;

export function setActiveTimeZone(zone: string | null | undefined) {
  active = isValidTimeZone(zone) ? zone : null;
}

/** Fuso efectivo: o escolhido ou, na falta dele, o do dispositivo. */
export function activeTimeZone(): string {
  return active ?? deviceTimeZone();
}

/** "America/Sao_Paulo" → "Sao Paulo"; "UTC" → "UTC". */
export function zoneCity(zone: string): string {
  if (zone === "UTC" || !zone.includes("/")) return zone;
  const parts = zone.split("/");
  return parts[parts.length - 1].replace(/_/g, " ");
}

/** Nomes de cidade que não queremos mostrar em inglês na interface portuguesa. */
const PT_CITIES: Record<string, string> = {
  Lisbon: "Lisboa",
  London: "Londres",
  "Sao Paulo": "São Paulo",
  "New York": "Nova Iorque",
  "Mexico City": "Cidade do México",
  Tokyo: "Tóquio",
  Shanghai: "Xangai",
  Beijing: "Pequim",
  Moscow: "Moscovo",
  Munich: "Munique",
  Zurich: "Zurique",
  Copenhagen: "Copenhaga",
  Athens: "Atenas",
};

/** Etiqueta curta para mostrar ao lado de uma hora, ex.: "Lisboa". */
export function zoneLabel(zone: string = activeTimeZone()): string {
  const city = zoneCity(zone);
  return activeLang() === "pt" ? PT_CITIES[city] ?? city : city;
}

/** Hora actual no fuso efectivo, para pré-visualizar a escolha no perfil. */
export function zoneClock(zone: string = activeTimeZone(), locale = "pt-PT"): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  }).format(new Date());
}
