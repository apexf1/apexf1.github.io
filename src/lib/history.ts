import manifestJson from "../data/history/manifest.json";

/** [posição, piloto, equipa, grid, voltas, pontos, tempo/estado, volta rápida?] */
export type HistoryRow = [
  posText: string,
  driverId: string,
  constructorId: string,
  grid: number,
  laps: number,
  points: number,
  timeOrStatus: string,
  fastestLap?: string | null,
];

export interface HistoryRace {
  r: number;
  n: string;
  c: string;
  l: string;
  co: string;
  d: string;
  fl: { driver: string; time: string | null } | null;
  res: HistoryRow[];
}

export interface SeasonChampion {
  id: string;
  name: string;
  team: string;
  points: number;
  wins: number;
  position: number;
}

export interface SeasonSummary {
  year: number;
  races: number;
  drivers: number;
  champion: SeasonChampion | null;
  teamChampion: { id: string; name: string; points: number; wins: number } | null;
  winner: string | null;
  firstRace: string | null;
  lastRace: string | null;
}

export interface HistoryManifest {
  generated: string;
  source: string;
  firstYear: number;
  lastYear: number;
  years: SeasonSummary[];
}

export interface CareerSeason {
  y: number;
  t: string;
  p: number;
  pts: number;
  w: number;
  r: number;
}

export interface Career {
  seasons: CareerSeason[];
  starts: number;
  wins: number;
  podiums: number;
  points: number;
  fastestLaps: number;
  championships: number;
  first: number | null;
  last: number | null;
}

/** [nome, nacionalidade, data de nascimento, código, número] */
export type HistoryDriver = [string, string, string, string, number | null];
/** [nome, nacionalidade] */
export type HistoryConstructor = [string, string];

export const historyManifest = manifestJson as unknown as HistoryManifest;

export const seasonsByYear = new Map(
  historyManifest.years.map((season) => [season.year, season]),
);

export const historyDecades = Array.from(
  new Set(historyManifest.years.map((season) => Math.floor(season.year / 10) * 10)),
).sort((a, b) => a - b);

type Chunk = { decade: number; years: Record<string, HistoryRace[]> };

const chunks: Record<number, () => Promise<{ default: unknown }>> = {
  1950: () => import("../data/history/decade-1950.json"),
  1960: () => import("../data/history/decade-1960.json"),
  1970: () => import("../data/history/decade-1970.json"),
  1980: () => import("../data/history/decade-1980.json"),
  1990: () => import("../data/history/decade-1990.json"),
  2000: () => import("../data/history/decade-2000.json"),
  2010: () => import("../data/history/decade-2010.json"),
  2020: () => import("../data/history/decade-2020.json"),
};

const loaded = new Map<number, Promise<Record<string, HistoryRace[]>>>();

export function loadDecade(decade: number): Promise<Record<string, HistoryRace[]>> {
  const key = Math.floor(decade / 10) * 10;
  const existing = loaded.get(key);
  if (existing) return existing;
  const loader = chunks[key];
  if (!loader) return Promise.reject(new Error(`Sem arquivo para a década de ${key}`));
  const promise = loader()
    .then((module) => (module.default as Chunk).years)
    .catch((error) => {
      loaded.delete(key);
      throw error;
    });
  loaded.set(key, promise);
  return promise;
}

export async function loadSeason(year: number): Promise<HistoryRace[]> {
  const years = await loadDecade(year);
  return years[String(year)] ?? [];
}

let careersPromise: Promise<Record<string, Career>> | null = null;
export function loadCareers(): Promise<Record<string, Career>> {
  if (!careersPromise) {
    careersPromise = import("../data/history/careers.json").then(
      (module) => (module.default ?? {}) as Record<string, Career>,
    );
  }
  return careersPromise;
}

interface PeopleIndex {
  drivers: Record<string, HistoryDriver>;
  constructors: Record<string, HistoryConstructor>;
}

let peoplePromise: Promise<PeopleIndex> | null = null;
export function loadPeople(): Promise<PeopleIndex> {
  if (!peoplePromise) {
    peoplePromise = Promise.all([
      import("../data/history/drivers.json"),
      import("../data/history/constructors.json"),
    ]).then(([drivers, constructors]) => ({
      drivers: ((drivers.default ?? {}) as unknown) as Record<string, HistoryDriver>,
      constructors: ((constructors.default ?? {}) as unknown) as Record<string, HistoryConstructor>,
    }));
  }
  return peoplePromise;
}

export const CURRENT_SEASON = new Date().getFullYear();

/** A temporada em curso ainda não tem campeão: o topo é o líder do momento. */
export const seasonInProgress = (year: number): boolean => year >= CURRENT_SEASON;

export const historyStats = (() => {
  const years = historyManifest.years;
  const races = years.reduce((total, season) => total + season.races, 0);
  const champions = new Set(years.map((season) => season.champion?.id).filter(Boolean));
  return {
    seasons: years.length,
    races,
    champions: champions.size,
    firstYear: historyManifest.firstYear,
    lastYear: historyManifest.lastYear,
  };
})();

export const isPodium = (posText: string): boolean =>
  posText === "1" || posText === "2" || posText === "3";

export const positionLabel = (posText: string): string => {
  if (posText === "R") return "DNF";
  if (posText === "D") return "DSQ";
  if (posText === "E") return "EXC";
  if (posText === "W") return "WD";
  if (posText === "F") return "DNQ";
  return posText;
};

export const winnerOfRace = (race: HistoryRace): string | null =>
  race.res.find((row) => row[0] === "1")?.[1] ?? null;

export const raceFastestLap = (race: HistoryRace): { driver: string; time: string | null } | null =>
  race.fl ?? null;
