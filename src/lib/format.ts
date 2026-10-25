import { activeLang, locale, tStatic } from "./language";
import { activeTimeZone, zoneLabel } from "./timezone";

export const pct = (value: number, digits = 0) =>
  `${(value * 100).toLocaleString(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;

export const num = (value: number, digits = 0) =>
  value.toLocaleString(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const formatDate = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale(), {
    day: "2-digit",
    month: "short",
    timeZone: activeTimeZone(),
    ...opts,
  }).format(new Date(iso));

export const formatDateLong = (iso: string) =>
  new Intl.DateTimeFormat(locale(), {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: activeTimeZone(),
  }).format(new Date(iso));

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat(locale(), {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: activeTimeZone(),
  }).format(new Date(iso));

export const formatDateTime = (iso: string) =>
  `${formatDate(iso)} · ${formatTime(iso)}`;

/** Etiqueta do fuso em uso, ex.: "Lisboa" — para acompanhar as horas. */
export const formatZone = () => zoneLabel();

export const formatGap = (gap: number | null, lapped?: boolean) => {
  if (lapped) return tStatic("1 volta");
  if (gap === null || !Number.isFinite(gap)) return "—";
  if (gap === 0) return tStatic("LÍDER");
  return `+${gap.toFixed(3)}`;
};

export const formatInterval = (interval: number | null) => {
  if (interval === null || !Number.isFinite(interval)) return "—";
  if (interval === 0) return "—";
  return `+${interval.toFixed(3)}`;
};

export const formatLapTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  return `${m}:${(seconds - m * 60).toFixed(3).padStart(6, "0")}`;
};

export const countdownParts = (target: string, now: Date) => {
  const diff = Math.max(0, new Date(target).getTime() - now.getTime());
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);
  return { diff, days, hours, minutes, seconds };
};

export const shortTeam = (name: string) => name.replace(" F1 Team", "").replace(" Racing", "");

export const ordinal = (position: number) => {
  if (activeLang() === "pt") return `${position}º`;
  const mod100 = position % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${position}th`;
  const suffix = ["th", "st", "nd", "rd"][position % 10] ?? "th";
  return `${position}${suffix}`;
};

export const compoundLabel = (compound: string) => {
  const map: Record<string, string> = {
    SOFT: "S",
    MEDIUM: "M",
    HARD: "H",
    INTERMEDIATE: "I",
    WET: "W",
    UNKNOWN: "?",
  };
  return map[compound] ?? compound.slice(0, 1);
};

export const compoundName = (compound: string) => {
  const map: Record<string, string> = {
    SOFT: "Macio",
    MEDIUM: "Médio",
    HARD: "Duro",
    INTERMEDIATE: "Intermediário",
    WET: "Pneu de chuva",
    UNKNOWN: "Desconhecido",
  };
  return tStatic(map[compound] ?? compound);
};

export const weatherLabel = (weather: string) =>
  tStatic(weather === "wet" ? "Chuva" : weather === "mixed" ? "Misto" : "Seco");

export const raceNameShort = (name: string) =>
  name
    .replace(" Grand Prix", " GP")
    .replace("Grand Prix ", "GP ")
    .replace("Bahrain Grand Prix in Malaysia", tStatic("GP do Bahrain (Malásia)"));

const RACE_LABELS: Record<string, string> = {
  albert_park: "Austrália",
  shanghai: "China",
  suzuka: "Japão",
  miami: "Miami",
  villeneuve: "Canadá",
  monaco: "Mônaco",
  catalunya: "Barcelona",
  red_bull_ring: "Áustria",
  silverstone: "Grã-Bretanha",
  spa: "Bélgica",
  hungaroring: "Hungria",
  zandvoort: "Holanda",
  monza: "Itália",
  madring: "Madri",
  baku: "Azerbaijão",
  sepang: "Malásia",
  marina_bay: "Singapura",
  americas: "Estados Unidos",
  rodriguez: "Cidade do México",
  interlagos: "São Paulo",
  vegas: "Las Vegas",
  losail: "Catar",
  yas_marina: "Abu Dhabi",
};

export const raceLabel = (race: { circuitId: string; shortName?: string }) =>
  tStatic(RACE_LABELS[race.circuitId] ?? race.shortName ?? race.circuitId);
